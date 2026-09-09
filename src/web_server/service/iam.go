package service

import (
	"net/http"
	"strings"

	"configcenter/src/web_server/middleware/authorization"

	"github.com/gin-gonic/gin"
)

func (s *Service) iamEnabled(c *gin.Context) bool {
	if s.Config == nil || !s.Config.Authorization.Enabled || s.Policy == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "standalone authorization is disabled"})
		return false
	}
	return true
}

func (s *Service) iamAdmin(c *gin.Context) bool {
	if !s.iamEnabled(c) {
		return false
	}
	allowed, err := s.Policy.Enforce(authorization.Subject(c), "*", "iam", "admin")
	if err != nil || !allowed {
		c.JSON(http.StatusForbidden, gin.H{"error": "authorization administrator permission required"})
		return false
	}
	return true
}

func (s *Service) IAMPermissions(c *gin.Context) {
	if !s.iamEnabled(c) {
		return
	}
	policies, err := s.Policy.Policies()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	groupings, err := s.Policy.Groupings()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"subject": authorization.Subject(c), "policies": policies, "groupings": groupings})
}

func (s *Service) IAMPolicies(c *gin.Context) {
	if !s.iamAdmin(c) {
		return
	}
	policies, err := s.Policy.Policies()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"policies": policies})
}

func (s *Service) IAMAddPolicy(c *gin.Context) {
	if !s.iamAdmin(c) {
		return
	}
	var policy []string
	if err := c.ShouldBindJSON(&policy); err != nil || len(policy) != 5 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "policy must be a five-element JSON array"})
		return
	}
	added, err := s.Policy.AddPolicy(policy)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"added": added})
}

func (s *Service) IAMRemovePolicy(c *gin.Context) {
	if !s.iamAdmin(c) {
		return
	}
	var policy []string
	if err := c.ShouldBindJSON(&policy); err != nil || len(policy) != 5 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "policy must be a five-element JSON array"})
		return
	}
	removed, err := s.Policy.RemovePolicy(policy)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"removed": removed})
}

func (s *Service) IAMGroupings(c *gin.Context) {
	if !s.iamAdmin(c) {
		return
	}
	groupings, err := s.Policy.Groupings()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"groupings": groupings})
}

type iamGroupingRequest struct {
	Subject string `json:"subject"`
	Role    string `json:"role"`
	Domain  string `json:"domain"`
}

func (s *Service) IAMAddGrouping(c *gin.Context) {
	if !s.iamAdmin(c) {
		return
	}
	var req iamGroupingRequest
	if err := c.ShouldBindJSON(&req); err != nil || strings.TrimSpace(req.Subject) == "" || strings.TrimSpace(req.Role) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "subject and role are required"})
		return
	}
	added, err := s.Policy.AddGrouping(req.Subject, req.Role, req.Domain)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"added": added})
}

func (s *Service) IAMRemoveGrouping(c *gin.Context) {
	if !s.iamAdmin(c) {
		return
	}
	var req iamGroupingRequest
	if err := c.ShouldBindJSON(&req); err != nil || strings.TrimSpace(req.Subject) == "" || strings.TrimSpace(req.Role) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "subject and role are required"})
		return
	}
	removed, err := s.Policy.RemoveGrouping(req.Subject, req.Role, req.Domain)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"removed": removed})
}

func (s *Service) IAMPolicyReload(c *gin.Context) {
	if !s.iamAdmin(c) {
		return
	}
	// The first implementation is in-memory. Reload is intentionally idempotent
	// and acts as a health/compatibility endpoint until a persistent repository is added.
	c.JSON(http.StatusOK, gin.H{"reloaded": true})
}
