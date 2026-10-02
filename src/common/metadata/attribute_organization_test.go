package metadata

import (
	"context"
	"testing"
)

// 回归:非必填 organization 字段提交空串曾被类型校验拒绝(1199011),
// 对齐 validUser 惯例后空串按未填写处理。
func TestValidOrganizationEmptyString(t *testing.T) {
	attr := Attribute{PropertyType: FieldTypeOrganization, IsRequired: false}

	// 非必填 + 空串 → 放行
	if rawErr := attr.validOrganization(context.Background(), "", "bk_project_team"); rawErr.ErrCode != 0 {
		t.Fatalf("optional empty string should pass, got: %+v", rawErr)
	}
	// 非必填 + nil → 放行(原语义)
	if rawErr := attr.validOrganization(context.Background(), nil, "bk_project_team"); rawErr.ErrCode != 0 {
		t.Fatalf("optional nil should pass, got: %+v", rawErr)
	}
	// 必填 + 空串 → ParamsNeedSet
	required := Attribute{PropertyType: FieldTypeOrganization, IsRequired: true}
	if rawErr := required.validOrganization(context.Background(), "", "bk_project_team"); rawErr.ErrCode != common.CCErrCommParamsNeedSet {
		t.Fatalf("required empty string should be ParamsNeedSet, got: %+v", rawErr)
	}
	// 非数组值(数字) → 类型错误(原语义)
	if rawErr := attr.validOrganization(context.Background(), 123, "bk_project_team"); rawErr.ErrCode != common.CCErrCommParamsInvalid {
		t.Fatalf("non-array value should be ParamsInvalid, got: %+v", rawErr)
	}
	// 合法数组 → 放行
	if rawErr := attr.validOrganization(context.Background(), []interface{}{int64(1)}, "bk_project_team"); rawErr.ErrCode != 0 {
		t.Fatalf("valid array should pass, got: %+v", rawErr)
	}
}
