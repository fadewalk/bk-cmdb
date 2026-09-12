package middleware

import (
	"crypto/subtle"
	"fmt"
	"net/http"
	"os"
	"strings"

	"configcenter/src/apimachinery/discovery"
	httpheader "configcenter/src/common/http/header"
	"configcenter/src/common/http/httpclient"
	"configcenter/src/common/resource/jwt"

	"github.com/gin-gonic/gin"
)

const (
	standaloneAPIKeyHeader      = "X-API-Key"
	standaloneAPIKeyEnv         = "CMDB_API_KEY"
	standaloneAPIUserEnv        = "CMDB_API_USER"
	standaloneAPISupplier       = "CMDB_API_SUPPLIER_ACCOUNT"
	standaloneAPIAppCode        = "CMDB_API_APP_CODE"
	standaloneAPIKeyRequiredEnv = "CMDB_API_KEY_REQUIRED"
)

type standaloneAPIIdentity struct {
	User            string
	SupplierAccount string
	AppCode         string
}

// StandaloneAPIKeyProxy authenticates machine calls before the browser login
// middleware. Required mode never falls through to a browser or skip-login session.
func StandaloneAPIKeyProxy(disc discovery.DiscoveryInterface) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !isAPIRequest(c.Request.URL.Path) {
			c.Next()
			return
		}

		identity, configured, presented := standaloneAPIKeyIdentity(c.Request.Header)
		if !configured {
			if standaloneAPIKeyRequired() {
				c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"status": "standalone api key is required"})
				return
			}
			c.Next()
			return
		}
		if !presented || identity.User == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"status": "invalid standalone api key"})
			return
		}

		setStandaloneAPIHeaders(c.Request.Header, identity)
		if err := proxyStandaloneAPIRequest(c, disc); err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"status": err.Error()})
		}
		c.Abort()
	}
}

func standaloneAPIKeyRequired() bool {
	value := strings.TrimSpace(strings.ToLower(os.Getenv(standaloneAPIKeyRequiredEnv)))
	return value == "1" || value == "true" || value == "yes" || value == "on"
}

func isAPIRequest(path string) bool {
	path = strings.TrimPrefix(path, "/")
	return path == "api" || strings.HasPrefix(path, "api/")
}

func standaloneAPIKeyIdentity(header http.Header) (standaloneAPIIdentity, bool, bool) {
	expected, configured := os.LookupEnv(standaloneAPIKeyEnv)
	if !configured || expected == "" {
		return standaloneAPIIdentity{}, false, false
	}

	if values := header.Values(standaloneAPIKeyHeader); len(values) > 1 {
		return standaloneAPIIdentity{}, true, true
	}
	if values := header.Values("Authorization"); len(values) > 1 {
		return standaloneAPIIdentity{}, true, true
	}
	presented := strings.TrimSpace(header.Get(standaloneAPIKeyHeader))
	if presented == "" {
		const bearerPrefix = "Bearer "
		authorization := strings.TrimSpace(header.Get("Authorization"))
		if len(authorization) >= len(bearerPrefix) &&
			strings.EqualFold(authorization[:len(bearerPrefix)], bearerPrefix) {
			presented = strings.TrimSpace(authorization[len(bearerPrefix):])
		}
	}
	if presented == "" {
		return standaloneAPIIdentity{}, true, false
	}
	if subtle.ConstantTimeCompare([]byte(presented), []byte(expected)) != 1 {
		return standaloneAPIIdentity{}, true, true
	}

	user := strings.TrimSpace(os.Getenv(standaloneAPIUserEnv))
	supplier := strings.TrimSpace(os.Getenv(standaloneAPISupplier))
	appCode := strings.TrimSpace(os.Getenv(standaloneAPIAppCode))
	if user == "" || supplier == "" || appCode == "" {
		return standaloneAPIIdentity{}, true, true
	}

	return standaloneAPIIdentity{
		User:            user,
		SupplierAccount: supplier,
		AppCode:         appCode,
	}, true, true
}

func setStandaloneAPIHeaders(header http.Header, identity standaloneAPIIdentity) {
	httpheader.SetUser(header, identity.User)
	httpheader.SetSupplierAccount(header, identity.SupplierAccount)
	httpheader.SetAppCode(header, identity.AppCode)
	if httpheader.GetLanguage(header) == "" {
		httpheader.SetLanguage(header, "zh-cn")
	}
}

func proxyStandaloneAPIRequest(c *gin.Context, disc discovery.DiscoveryInterface) error {
	signedHeader, err := jwt.GetHandler().Sign(c.Request.Header)
	if err != nil {
		return fmt.Errorf("sign standalone api request failed: %w", err)
	}
	c.Request.Header = signedHeader

	servers, err := disc.ApiServer().GetServers()
	if err != nil || len(servers) == 0 {
		if err != nil {
			return fmt.Errorf("no api server can be used: %w", err)
		}
		return fmt.Errorf("no api server can be used")
	}

	httpclient.ProxyHttp(c, servers[0])
	return nil
}
