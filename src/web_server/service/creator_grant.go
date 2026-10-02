package service

import (
	"bytes"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"configcenter/src/common/blog"
	httpheader "configcenter/src/common/http/header"
	"configcenter/src/web_server/middleware/authorization"

	"github.com/gin-gonic/gin"
)

// resource-create paths whose responses carry a newly created resource id.
// Business and business-set creation also exists on web_server table routes;
// project creation is a proxied batch endpoint. Responses are small JSON, so
// tee-buffering them is cheap.
var creatorGrantPaths = map[string]bool{
	"/table/biz/":              false, // prefix match (POST /table/biz/:supplier)
	"/table/create/biz_set":    true,
	"/api/v3/create/biz_set":   true,
	"/api/v3/createmany/project": true,
}

// creatorResourceIDKeys are the response fields holding a new resource id.
var creatorResourceIDKeys = map[string]bool{
	"bk_biz_id":      true,
	"bk_biz_set_id":  true,
	"bk_project_id":  true,
}

const maxGrantIDsPerResponse = 50

// shouldCaptureCreatorPath reports whether the request response must be
// inspected for created resource ids.
func shouldCaptureCreatorPath(method, path string) bool {
	if method != http.MethodPost {
		return false
	}
	for pattern, exact := range creatorGrantPaths {
		if exact && path == pattern {
			return true
		}
		if !exact && strings.HasPrefix(path, pattern) {
			return true
		}
	}
	return false
}

// extractCreatorResourceIDs walks the response document and collects numeric
// resource ids (deduplicated, capped).
func extractCreatorResourceIDs(body []byte) []string {
	var doc interface{}
	if err := json.Unmarshal(body, &doc); err != nil {
		return nil
	}
	seen := make(map[string]bool)
	ids := make([]string, 0)
	var walk func(node interface{})
	walk = func(node interface{}) {
		if len(ids) >= maxGrantIDsPerResponse {
			return
		}
		switch value := node.(type) {
		case map[string]interface{}:
			for key, child := range value {
				if creatorResourceIDKeys[key] {
					if id, ok := numericIDString(child); ok && !seen[id] {
						seen[id] = true
						ids = append(ids, id)
					}
				}
				walk(child)
			}
		case []interface{}:
			for _, child := range value {
				walk(child)
			}
		}
	}
	walk(doc)
	return ids
}

func numericIDString(value interface{}) (string, bool) {
	switch number := value.(type) {
	case float64:
		if number > 0 && number == float64(int64(number)) {
			return strconv.FormatInt(int64(number), 10), true
		}
	case string:
		if parsed, err := strconv.ParseInt(number, 10, 64); err == nil && parsed > 0 {
			return strconv.FormatInt(parsed, 10), true
		}
	}
	return "", false
}

// teeCaptureWriter siphons a copy of the response body while passing it
// through untouched.
type teeCaptureWriter struct {
	gin.ResponseWriter
	buf *bytes.Buffer
}

func (w *teeCaptureWriter) Write(data []byte) (int, error) {
	w.buf.Write(data)
	return w.ResponseWriter.Write(data)
}

func (w *teeCaptureWriter) WriteString(data string) (int, error) {
	w.buf.WriteString(data)
	return w.ResponseWriter.WriteString(data)
}

// CreatorAutoGrant implements "creator becomes domain admin": after a
// successful business/business-set/project creation the creator is bound to
// the biz_admin role for the new resource domain. It is a no-op unless the
// standalone authorization is enabled; machine (API-key) creators are granted
// under their own subject as well.
func (s *Service) CreatorAutoGrant() gin.HandlerFunc {
	return func(c *gin.Context) {
		if s.Policy == nil || !shouldCaptureCreatorPath(c.Request.Method, c.Request.URL.Path) {
			c.Next()
			return
		}
		capture := &teeCaptureWriter{ResponseWriter: c.Writer, buf: &bytes.Buffer{}}
		c.Writer = capture
		c.Next()

		subject := authorization.Subject(c)
		if subject == "" || subject == "anonymous" {
			return
		}
		var resp struct {
			Result bool `json:"result"`
		}
		if err := json.Unmarshal(capture.buf.Bytes(), &resp); err != nil || !resp.Result {
			return
		}
		for _, id := range extractCreatorResourceIDs(capture.buf.Bytes()) {
			if added, err := s.Policy.AddGrouping(subject, authorization.BizAdminRole, id); err != nil {
				blog.Errorf("creator auto grant failed, subject: %s, domain: %s, err: %v, rid: %s",
					subject, id, err, httpheader.GetRid(c.Request.Header))
			} else if added {
				blog.Infof("creator auto granted, subject: %s, role: %s, domain: %s, rid: %s",
					subject, authorization.BizAdminRole, id, httpheader.GetRid(c.Request.Header))
			}
		}
	}
}
