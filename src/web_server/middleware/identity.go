package middleware

import (
	"net/http"

	"configcenter/src/common/http/header"

	"github.com/gin-gonic/gin"
)

// SanitizeExternalIdentityHeaders is the web trust boundary. Identity and
// internal-request headers are generated only after authentication succeeds.
func SanitizeExternalIdentityHeaders() gin.HandlerFunc {
	return func(c *gin.Context) {
		requestHeader := c.Request.Header
		for _, name := range externalIdentityHeaders {
			values, present := requestHeader[http.CanonicalHeaderKey(name)]
			if !present {
				continue
			}
			if len(values) > 1 {
				c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"status": "duplicate identity header"})
				return
			}
			requestHeader.Del(name)
		}

		for _, name := range []string{header.IsInnerReqHeader, header.ReqFromWebHeader} {
			if values, present := requestHeader[http.CanonicalHeaderKey(name)]; present && len(values) > 0 {
				c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"status": "forbidden internal request header"})
				return
			}
		}

		c.Next()
	}
}

var externalIdentityHeaders = []string{
	header.UserHeader,
	header.BKHTTPHeaderUser,
	header.SupplierAccountHeader,
	header.BKHTTPOwner,
	header.BKHTTPOwnerID,
	header.UserTokenHeader,
	header.UserTicketHeader,
	header.AppCodeHeader,
	header.BKHTTPRequestAppCode,
}
