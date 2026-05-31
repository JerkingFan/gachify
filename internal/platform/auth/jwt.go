package auth

import (
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

type TokenType string

const (
	TokenAccess  TokenType = "access"
	TokenRefresh TokenType = "refresh"
)

type Claims struct {
	jwt.RegisteredClaims
	Type TokenType `json:"typ"`
}

type TokenService struct {
	secret     []byte
	accessTTL  time.Duration
	refreshTTL time.Duration
}

func NewTokenService(secret string, accessTTL, refreshTTL time.Duration) *TokenService {
	return &TokenService{
		secret:     []byte(secret),
		accessTTL:  accessTTL,
		refreshTTL: refreshTTL,
	}
}

func (s *TokenService) IssueAccess(userID uuid.UUID) (string, time.Time, error) {
	return s.issue(userID, TokenAccess, s.accessTTL)
}

func (s *TokenService) IssueRefresh(userID uuid.UUID) (string, time.Time, error) {
	return s.issue(userID, TokenRefresh, s.refreshTTL)
}

func (s *TokenService) issue(userID uuid.UUID, typ TokenType, ttl time.Duration) (string, time.Time, error) {
	now := time.Now()
	exp := now.Add(ttl)
	claims := Claims{
		Type: typ,
		RegisteredClaims: jwt.RegisteredClaims{
			ID:        uuid.New().String(),
			Subject:   userID.String(),
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(exp),
			Issuer:    "gachify",
		},
	}
	t := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := t.SignedString(s.secret)
	if err != nil {
		return "", time.Time{}, fmt.Errorf("sign token: %w", err)
	}
	return signed, exp, nil
}

func (s *TokenService) Parse(token string, expected TokenType) (uuid.UUID, error) {
	claims, err := s.parseClaims(token, expected)
	if err != nil {
		return uuid.Nil, err
	}
	id, err := uuid.Parse(claims.Subject)
	if err != nil {
		return uuid.Nil, fmt.Errorf("invalid subject")
	}
	return id, nil
}

type AccessMeta struct {
	UserID uuid.UUID
	JTI    string
	Exp    time.Time
}

func (s *TokenService) ParseAccessMeta(token string) (AccessMeta, error) {
	claims, err := s.parseClaims(token, TokenAccess)
	if err != nil {
		return AccessMeta{}, err
	}
	id, err := uuid.Parse(claims.Subject)
	if err != nil {
		return AccessMeta{}, fmt.Errorf("invalid subject")
	}
	exp := time.Time{}
	if claims.ExpiresAt != nil {
		exp = claims.ExpiresAt.Time
	}
	return AccessMeta{UserID: id, JTI: claims.ID, Exp: exp}, nil
}

func (s *TokenService) parseClaims(token string, expected TokenType) (*Claims, error) {
	parsed, err := jwt.ParseWithClaims(token, &Claims{}, func(t *jwt.Token) (any, error) {
		if t.Method != jwt.SigningMethodHS256 {
			return nil, fmt.Errorf("unexpected signing method")
		}
		return s.secret, nil
	})
	if err != nil {
		return nil, fmt.Errorf("parse token: %w", err)
	}
	claims, ok := parsed.Claims.(*Claims)
	if !ok || !parsed.Valid {
		return nil, fmt.Errorf("invalid token claims")
	}
	if claims.Type != expected {
		return nil, fmt.Errorf("invalid token type")
	}
	return claims, nil
}

func (s *TokenService) RefreshTTL() time.Duration {
	return s.refreshTTL
}
