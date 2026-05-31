package domain

type RegisterInput struct {
	Email       string `json:"email"`
	Password    string `json:"password"`
	Handle      string `json:"handle"`
	DisplayName string `json:"display_name"`
}

type LoginInput struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type TokenResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int64  `json:"expires_in"`
	TokenType    string `json:"token_type"`
	User         User   `json:"user"`
}

type RefreshInput struct {
	RefreshToken string `json:"refresh_token"`
}

type ForgotPasswordInput struct {
	Email string `json:"email"`
}

type ResetPasswordInput struct {
	Token    string `json:"token"`
	Password string `json:"password"`
}

type VerifyEmailInput struct {
	Token string `json:"token"`
}

type LibraryImportInput struct {
	LikedTrackIDs []string              `json:"liked_track_ids"`
	Playlists     []ImportPlaylistInput `json:"playlists"`
}

type ImportPlaylistInput struct {
	Name        string   `json:"name"`
	Description string   `json:"description"`
	TrackIDs    []string `json:"track_ids"`
}
