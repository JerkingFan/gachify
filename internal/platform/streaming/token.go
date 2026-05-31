package streaming

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
)

var ErrInvalidToken = errors.New("invalid or expired playback token")

type PlaybackClaims struct {
	TrackID   string `json:"tid"`
	UserID    string `json:"uid,omitempty"`
	ExpiresAt int64  `json:"exp"`
}

type TokenSigner struct {
	secret []byte
	ttl    time.Duration
}

func NewTokenSigner(secret string, ttl time.Duration) *TokenSigner {
	return &TokenSigner{secret: []byte(secret), ttl: ttl}
}

func (s *TokenSigner) Issue(trackID uuid.UUID, userID *uuid.UUID) (string, time.Time, error) {
	exp := time.Now().Add(s.ttl)
	claims := PlaybackClaims{
		TrackID:   trackID.String(),
		ExpiresAt: exp.Unix(),
	}
	if userID != nil {
		claims.UserID = userID.String()
	}
	payload, err := json.Marshal(claims)
	if err != nil {
		return "", time.Time{}, err
	}
	sig := sign(payload, s.secret)
	token := base64.RawURLEncoding.EncodeToString(payload) + "." + base64.RawURLEncoding.EncodeToString(sig)
	return token, exp, nil
}

func (s *TokenSigner) Verify(token string) (PlaybackClaims, error) {
	parts := splitToken(token)
	if len(parts) != 2 {
		return PlaybackClaims{}, ErrInvalidToken
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return PlaybackClaims{}, ErrInvalidToken
	}
	sig, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return PlaybackClaims{}, ErrInvalidToken
	}
	if !hmac.Equal(sig, sign(payload, s.secret)) {
		return PlaybackClaims{}, ErrInvalidToken
	}
	var claims PlaybackClaims
	if err := json.Unmarshal(payload, &claims); err != nil {
		return PlaybackClaims{}, ErrInvalidToken
	}
	if time.Now().Unix() > claims.ExpiresAt {
		return PlaybackClaims{}, ErrInvalidToken
	}
	return claims, nil
}

func sign(payload, secret []byte) []byte {
	mac := hmac.New(sha256.New, secret)
	_, _ = mac.Write(payload)
	return mac.Sum(nil)
}

func splitToken(token string) []string {
	dot := -1
	for i := 0; i < len(token); i++ {
		if token[i] == '.' {
			dot = i
			break
		}
	}
	if dot < 0 {
		return nil
	}
	return []string{token[:dot], token[dot+1:]}
}

func ParseTrackID(claims PlaybackClaims) (uuid.UUID, error) {
	id, err := uuid.Parse(claims.TrackID)
	if err != nil {
		return uuid.Nil, fmt.Errorf("invalid track id in token")
	}
	return id, nil
}
