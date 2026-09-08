package oidc

import (
	"net/http"
	"net/url"
	"strings"
	"time"

	"configcenter/src/common"
	"configcenter/src/web_server/app/options"

	"github.com/gin-contrib/sessions"
	"github.com/gin-gonic/gin"
)

// Start begins the OIDC authorization-code flow. State, nonce and the PKCE
// verifier are kept server-side in the existing Redis-backed session.
func Start(c *gin.Context, cfg options.OIDC) {
	if !cfg.Enabled {
		c.JSON(http.StatusNotFound, gin.H{"error": "oidc login is disabled"})
		return
	}
	provider, err := NewProvider(c.Request.Context(), cfg)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
		return
	}
	state, err := RandomString(32)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "generate oidc state failed"})
		return
	}
	nonce, err := RandomString(32)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "generate oidc nonce failed"})
		return
	}
	verifier, challenge, err := PKCEVerifier()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "generate oidc verifier failed"})
		return
	}

	session := sessions.Default(c)
	session.Set(SessionStateKey, state)
	session.Set(SessionNonceKey, nonce)
	session.Set(SessionVerifierKey, verifier)
	session.Set(SessionReturnKey, safeReturnURL(c, c.Query("c_url")))
	session.Set(SessionCreatedKey, time.Now().Unix())
	if err := session.Save(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "save oidc session failed"})
		return
	}
	c.Redirect(http.StatusFound, AuthorizationURL(cfg, provider, state, nonce, challenge))
}

// Callback completes the OIDC flow and writes the same session fields used by
// the existing web_server middleware. The application token is opaque and
// random; the IdP token is never placed in the browser cookie.
func Callback(c *gin.Context, cfg options.OIDC) {
	if !cfg.Enabled {
		c.JSON(http.StatusNotFound, gin.H{"error": "oidc login is disabled"})
		return
	}
	session := sessions.Default(c)
	state, _ := session.Get(SessionStateKey).(string)
	nonce, _ := session.Get(SessionNonceKey).(string)
	verifier, _ := session.Get(SessionVerifierKey).(string)
	created, _ := session.Get(SessionCreatedKey).(int64)
	ttl := time.Duration(cfg.StateTTL) * time.Second
	if ttl <= 0 {
		ttl = 10 * time.Minute
	}
	if state == "" || c.Query("state") == "" || c.Query("state") != state || verifier == "" || StateExpired(time.Unix(created, 0), ttl) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid oidc state"})
		return
	}
	if c.Query("error") != "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "oidc authorization denied"})
		return
	}
	provider, err := NewProvider(c.Request.Context(), cfg)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
		return
	}
	_, rawID, err := Exchange(c.Request.Context(), cfg, provider, c.Query("code"), verifier)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "oidc token exchange failed"})
		return
	}
	claims, err := VerifyClaims(c.Request.Context(), provider, cfg, rawID, nonce)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "oidc identity verification failed"})
		return
	}
	appToken, err := RandomString(32)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "generate session token failed"})
		return
	}

	session.Set(common.WEBSessionUinKey, claims.PreferredUsername)
	session.Set(common.WEBSessionChineseNameKey, claims.Name)
	session.Set(common.WEBSessionEmailKey, claims.Email)
	session.Set(common.WEBSessionOwnerUinKey, "0")
	session.Set(common.HTTPCookieBKToken, appToken)
	session.Set(SessionUserKey, claims.PreferredUsername)
	session.Set(SessionNameKey, claims.Name)
	session.Set(SessionEmailKey, claims.Email)
	session.Set(SessionTokenKey, appToken)
	session.Set(SessionCreatedKey, time.Now().Unix())
	session.Delete(SessionStateKey)
	session.Delete(SessionNonceKey)
	session.Delete(SessionVerifierKey)
	if err := session.Save(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "save oidc session failed"})
		return
	}
	secure := c.Request.TLS != nil
	c.SetCookie(common.HTTPCookieBKToken, appToken, 0, "/", "", secure, true)
	returnURL, _ := session.Get(SessionReturnKey).(string)
	if returnURL == "" {
		returnURL = cfg.RedirectURL
	}
	session.Delete(SessionReturnKey)
	_ = session.Save()
	c.Redirect(http.StatusFound, safeReturnURL(c, returnURL))
}

func safeReturnURL(c *gin.Context, raw string) string {
	if raw == "" {
		return "/"
	}
	u, err := url.Parse(raw)
	if err != nil || u.IsAbs() || u.Host != "" || !strings.HasPrefix(u.Path, "/") || strings.HasPrefix(u.Path, "//") {
		return "/"
	}
	return u.RequestURI()
}
