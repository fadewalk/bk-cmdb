package authorization

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"configcenter/src/web_server/app/options"

	"github.com/gin-gonic/gin"
)

func TestMiddlewareAllowsBootstrapAdminAndRejectsUnknownUser(t *testing.T) {
	gin.SetMode(gin.TestMode)
	a, err := New(options.Authorization{BootstrapUsers: []string{"admin"}})
	if err != nil {
		t.Fatal(err)
	}

	router := gin.New()
	router.Use(func(c *gin.Context) { c.Request.Header.Set("X-Bkcmdb-User", "admin"); c.Next() })
	router.Use(Middleware(a, true))
	router.POST("/api/v3/create/project", func(c *gin.Context) { c.Status(http.StatusNoContent) })

	adminReq := httptest.NewRequest(http.MethodPost, "/api/v3/create/project", nil)
	adminResp := httptest.NewRecorder()
	router.ServeHTTP(adminResp, adminReq)
	if adminResp.Code != http.StatusNoContent {
		t.Fatalf("admin status=%d", adminResp.Code)
	}

	unknown := gin.New()
	unknown.Use(func(c *gin.Context) { c.Request.Header.Set("X-Bkcmdb-User", "alice"); c.Next() })
	unknown.Use(Middleware(a, true))
	unknown.POST("/api/v3/create/project", func(c *gin.Context) { c.Status(http.StatusNoContent) })
	unknownReq := httptest.NewRequest(http.MethodPost, "/api/v3/create/project", nil)
	unknownResp := httptest.NewRecorder()
	unknown.ServeHTTP(unknownResp, unknownReq)
	if unknownResp.Code != http.StatusForbidden {
		t.Fatalf("unknown status=%d", unknownResp.Code)
	}
}
