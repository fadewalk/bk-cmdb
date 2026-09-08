// Package oidc implements the standalone OpenID Connect login flow.
package oidc

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"time"

	"configcenter/src/common"
	errorspkg "configcenter/src/common/errors"
	"configcenter/src/common/metadata"
	"configcenter/src/web_server/app/options"
	"configcenter/src/web_server/middleware/user/plugins/manager"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/gin-contrib/sessions"
	"github.com/gin-gonic/gin"
	"golang.org/x/oauth2"
)

const (
	// Session keys are deliberately namespaced so they do not collide with legacy login plugins.
	SessionStateKey    = "cmdb_oidc_state"
	SessionNonceKey    = "cmdb_oidc_nonce"
	SessionVerifierKey = "cmdb_oidc_verifier"
	SessionReturnKey   = "cmdb_oidc_return_url"
	SessionUserKey     = "cmdb_oidc_user"
	SessionEmailKey    = "cmdb_oidc_email"
	SessionNameKey     = "cmdb_oidc_name"
	SessionTokenKey    = "cmdb_oidc_session_token"
	SessionCreatedKey  = "cmdb_oidc_created"
)

type Claims struct {
	Subject           string `json:"sub"`
	PreferredUsername string `json:"preferred_username"`
	Email             string `json:"email"`
	Name              string `json:"name"`
	Nickname          string `json:"nickname"`
	Picture           string `json:"picture"`
}

func init() {
	manager.RegisterPlugin(&metadata.LoginPluginInfo{
		Name:       "OpenID Connect login",
		Version:    common.BKOIDCLoginPluginVersion,
		HandleFunc: &plugin{},
	})
}

type plugin struct{}

func (p *plugin) LoginUser(c *gin.Context, _ map[string]string, _ bool) (*metadata.LoginUserInfo, bool) {
	session := sessionDefault(c)
	username, _ := session.Get(SessionUserKey).(string)
	token, _ := session.Get(SessionTokenKey).(string)
	if username == "" || token == "" {
		return nil, false
	}
	name, _ := session.Get(SessionNameKey).(string)
	email, _ := session.Get(SessionEmailKey).(string)
	if name == "" {
		name = username
	}
	return &metadata.LoginUserInfo{
		UserName: username,
		ChName:   name,
		Email:    email,
		BkToken:  token,
		OnwerUin: "0",
		Language: "zh-cn",
	}, true
}

func (p *plugin) GetLoginUrl(c *gin.Context, _ map[string]string, _ *metadata.LogoutRequestParams) string {
	return "/login/oidc/start?c_url=" + url.QueryEscape(c.Request.URL.String())
}

func (p *plugin) GetUserList(_ *gin.Context, _ map[string]string) ([]*metadata.LoginSystemUserInfo, *errorspkg.RawErrorInfo) {
	return []*metadata.LoginSystemUserInfo{}, nil
}

func sessionDefault(c *gin.Context) sessions.Session {
	return sessions.Default(c)
}

func RandomString(size int) (string, error) {
	buf := make([]byte, size)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}

func PKCEVerifier() (string, string, error) {
	verifier, err := RandomString(32)
	if err != nil {
		return "", "", err
	}
	hash := sha256.Sum256([]byte(verifier))
	challenge := base64.RawURLEncoding.EncodeToString(hash[:])
	return verifier, challenge, nil
}

func NewOIDCConfig(cfg options.OIDC, endpoint oauth2.Endpoint) *oauth2.Config {
	return &oauth2.Config{
		ClientID:     cfg.ClientID,
		ClientSecret: cfg.ClientSecret,
		Endpoint:     endpoint,
		RedirectURL:  cfg.RedirectURL,
		Scopes:       cfg.Scopes,
	}
}

func NewProvider(ctx context.Context, cfg options.OIDC) (*oidc.Provider, error) {
	if !cfg.Enabled {
		return nil, fmt.Errorf("oidc is disabled")
	}
	if strings.TrimSpace(cfg.IssuerURL) == "" || strings.TrimSpace(cfg.ClientID) == "" {
		return nil, fmt.Errorf("oidc issuerUrl and clientId are required")
	}
	return oidc.NewProvider(ctx, cfg.IssuerURL)
}

func VerifyClaims(ctx context.Context, provider *oidc.Provider, cfg options.OIDC, rawToken, nonce string) (Claims, error) {
	verifier := provider.Verifier(&oidc.Config{ClientID: cfg.ClientID})
	idToken, err := verifier.Verify(ctx, rawToken)
	if err != nil {
		return Claims{}, err
	}
	var claims Claims
	if err := idToken.Claims(&claims); err != nil {
		return Claims{}, err
	}
	if nonce == "" || idToken.Nonce != nonce {
		return Claims{}, errors.New("oidc nonce mismatch")
	}
	if claims.PreferredUsername == "" {
		claims.PreferredUsername = claims.Subject
	}
	if claims.Name == "" {
		claims.Name = claims.PreferredUsername
	}
	if claims.PreferredUsername == "" {
		return Claims{}, errors.New("oidc subject is empty")
	}
	return claims, nil
}

func AuthorizationURL(cfg options.OIDC, provider *oidc.Provider, state, nonce, challenge string) string {
	oc := NewOIDCConfig(cfg, provider.Endpoint())
	return oc.AuthCodeURL(state,
		oauth2.SetAuthURLParam("nonce", nonce),
		oauth2.SetAuthURLParam("code_challenge", challenge),
		oauth2.SetAuthURLParam("code_challenge_method", "S256"),
	)
}

func Exchange(ctx context.Context, cfg options.OIDC, provider *oidc.Provider, code, verifier string) (Claims, string, error) {
	if code == "" || verifier == "" {
		return Claims{}, "", errors.New("oidc code or verifier is empty")
	}
	oc := NewOIDCConfig(cfg, provider.Endpoint())
	token, err := oc.Exchange(ctx, code, oauth2.VerifierOption(verifier))
	if err != nil {
		return Claims{}, "", err
	}
	rawID, ok := token.Extra("id_token").(string)
	if !ok || rawID == "" {
		return Claims{}, "", errors.New("oidc response has no id_token")
	}
	return Claims{}, rawID, nil
}

func StateExpired(created time.Time, ttl time.Duration) bool {
	return ttl > 0 && time.Since(created) > ttl
}

// Keep the dependency visible to the compiler in builds where only helpers are used.
var _ = common.HTTPCookieBKToken
