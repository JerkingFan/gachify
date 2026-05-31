package storage

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/feature/s3/manager"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	appconfig "github.com/gachify/gachify/internal/config"
)

type Client struct {
	s3            *s3.Client
	presigner     *s3.PresignClient
	uploader      *manager.Uploader
	bucket        string
	maxBytes      int64
	publicBaseURL string
}

func NewClient(ctx context.Context, cfg appconfig.Config) (*Client, error) {
	awsCfg, err := loadAWSConfig(ctx, cfg, cfg.S3Endpoint)
	if err != nil {
		return nil, err
	}

	client := s3.NewFromConfig(awsCfg, s3Options(cfg.S3UsePathStyle))

	publicURL := stringsTrimRightSlash(cfg.S3PublicEndpoint)
	if cfg.CDNBaseURL != "" {
		publicURL = stringsTrimRightSlash(cfg.CDNBaseURL)
	}

	presignEndpoint := publicURL
	if presignEndpoint == "" {
		presignEndpoint = cfg.S3Endpoint
	}
	presignCfg, err := loadAWSConfig(ctx, cfg, presignEndpoint)
	if err != nil {
		return nil, fmt.Errorf("presign aws config: %w", err)
	}
	presignClient := s3.NewFromConfig(presignCfg, s3Options(cfg.S3UsePathStyle))

	return &Client{
		s3:            client,
		presigner:     s3.NewPresignClient(presignClient),
		uploader:      manager.NewUploader(client),
		bucket:        cfg.S3BucketMasters,
		maxBytes:      cfg.UploadMaxBytes,
		publicBaseURL: publicURL,
	}, nil
}

func s3Options(pathStyle bool) func(*s3.Options) {
	return func(o *s3.Options) {
		o.UsePathStyle = pathStyle
	}
}

func loadAWSConfig(ctx context.Context, cfg appconfig.Config, endpointURL string) (aws.Config, error) {
	resolver := aws.EndpointResolverWithOptionsFunc(func(service, region string, _ ...any) (aws.Endpoint, error) {
		if service == s3.ServiceID {
			return aws.Endpoint{
				URL:               endpointURL,
				HostnameImmutable: cfg.S3UsePathStyle,
			}, nil
		}
		return aws.Endpoint{}, fmt.Errorf("unknown service %s", service)
	})
	awsCfg, err := awsconfig.LoadDefaultConfig(ctx,
		awsconfig.WithRegion(cfg.S3Region),
		awsconfig.WithEndpointResolverWithOptions(resolver),
		awsconfig.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(
			cfg.S3AccessKey, cfg.S3SecretKey, "",
		)),
	)
	if err != nil {
		return aws.Config{}, fmt.Errorf("aws config: %w", err)
	}
	return awsCfg, nil
}

func (c *Client) Bucket() string { return c.bucket }

func stringsTrimRightSlash(s string) string {
	for len(s) > 0 && s[len(s)-1] == '/' {
		s = s[:len(s)-1]
	}
	return s
}

func (c *Client) rewritePresignedURL(url string) string {
	if c.publicBaseURL != "" && strings.Contains(url, "://") {
		if idx := strings.Index(url, "://"); idx >= 0 {
			rest := url[idx+3:]
			if slash := strings.Index(rest, "/"); slash >= 0 {
				return c.publicBaseURL + rest[slash:]
			}
		}
	}
	return url
}

func (c *Client) PresignPut(ctx context.Context, objectKey, contentType string, ttl time.Duration) (string, error) {
	out, err := c.presigner.PresignPutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(c.bucket),
		Key:         aws.String(objectKey),
		ContentType: aws.String(contentType),
	}, s3.WithPresignExpires(ttl))
	if err != nil {
		return "", fmt.Errorf("presign put: %w", err)
	}
	return c.rewritePresignedURL(out.URL), nil
}

func (c *Client) PresignGet(ctx context.Context, objectKey string, ttl time.Duration) (string, error) {
	out, err := c.presigner.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(c.bucket),
		Key:    aws.String(objectKey),
	}, s3.WithPresignExpires(ttl))
	if err != nil {
		return "", fmt.Errorf("presign get: %w", err)
	}
	return c.rewritePresignedURL(out.URL), nil
}

type ObjectInfo struct {
	Size        int64
	ContentType string
}

func (c *Client) HeadObject(ctx context.Context, objectKey string) (ObjectInfo, error) {
	out, err := c.s3.HeadObject(ctx, &s3.HeadObjectInput{
		Bucket: aws.String(c.bucket),
		Key:    aws.String(objectKey),
	})
	if err != nil {
		return ObjectInfo{}, fmt.Errorf("head object: %w", err)
	}
	size := int64(0)
	if out.ContentLength != nil {
		size = *out.ContentLength
	}
	ct := ""
	if out.ContentType != nil {
		ct = *out.ContentType
	}
	return ObjectInfo{Size: size, ContentType: ct}, nil
}

func (c *Client) GetObjectBytes(ctx context.Context, objectKey string) ([]byte, error) {
	out, err := c.s3.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(c.bucket),
		Key:    aws.String(objectKey),
	})
	if err != nil {
		return nil, fmt.Errorf("get object: %w", err)
	}
	defer out.Body.Close()
	return io.ReadAll(out.Body)
}

func (c *Client) DownloadToFile(ctx context.Context, objectKey, destPath string) error {
	out, err := c.s3.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(c.bucket),
		Key:    aws.String(objectKey),
	})
	if err != nil {
		return fmt.Errorf("get object: %w", err)
	}
	defer out.Body.Close()
	if err := os.MkdirAll(filepath.Dir(destPath), 0o755); err != nil {
		return err
	}
	f, err := os.Create(destPath)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = io.Copy(f, out.Body)
	return err
}

func (c *Client) UploadFile(ctx context.Context, localPath, objectKey, contentType string) error {
	f, err := os.Open(localPath)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = c.uploader.Upload(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(c.bucket),
		Key:         aws.String(objectKey),
		Body:        f,
		ContentType: aws.String(contentType),
	})
	if err != nil {
		return fmt.Errorf("upload: %w", err)
	}
	return nil
}

func (c *Client) UploadDirectory(ctx context.Context, localDir, keyPrefix string) error {
	return filepath.Walk(localDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() {
			return nil
		}
		rel, err := filepath.Rel(localDir, path)
		if err != nil {
			return err
		}
		rel = filepath.ToSlash(rel)
		key := keyPrefix + "/" + rel
		ct := contentTypeForExt(filepath.Ext(path))
		return c.UploadFile(ctx, path, key, ct)
	})
}

func contentTypeForExt(ext string) string {
	switch strings.ToLower(ext) {
	case ".m3u8":
		return "application/vnd.apple.mpegurl"
	case ".ts":
		return "video/mp2t"
	case ".mp3":
		return "audio/mpeg"
	case ".flac":
		return "audio/flac"
	case ".wav":
		return "audio/wav"
	default:
		return "application/octet-stream"
	}
}

func (c *Client) MaxUploadBytes() int64 {
	return c.maxBytes
}

func (c *Client) Ping(ctx context.Context) error {
	_, err := c.s3.HeadBucket(ctx, &s3.HeadBucketInput{
		Bucket: aws.String(c.bucket),
	})
	if err != nil {
		return fmt.Errorf("head bucket: %w", err)
	}
	return nil
}
