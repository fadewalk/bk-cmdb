/*
 * Tencent is pleased to support the open source community by making
 * 蓝鲸智云 - 配置平台 (BlueKing - Configuration System) available.
 * Copyright (C) 2017 Tencent. All rights reserved.
 * Licensed under the MIT License (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://opensource.org/licenses/MIT
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an "AS IS"
 * BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and limitations
 * under the License. We undertake not to change the open source license (MIT
 * license) applicable to the current version of the project delivered to anyone
 * in the future.
 */

package cloudvendor

import (
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"configcenter/src/common/metadata"
	ccom "configcenter/src/scene_server/cloud_server/common"
)

type fakeVendorCall struct {
	method  string
	region  string
	limit   int64
	filters []*ccom.Filter
}

type fakeVendorClient struct {
	secretID  string
	secretKey string

	secretIDSeen  string
	secretKeySeen string
	calls         []fakeVendorCall

	regions   []*metadata.Region
	vpcs      *metadata.VpcsInfo
	instances *metadata.InstancesInfo
	totalCnt  int64
	err       error
}

func (f *fakeVendorClient) NewVendorClient(secretID, secretKey string) VendorClient {
	client := *f
	client.secretIDSeen = secretID
	client.secretKeySeen = secretKey
	return &client
}

func (f *fakeVendorClient) GetRegions() ([]*metadata.Region, error) {
	return f.regions, f.err
}

func (f *fakeVendorClient) GetVpcs(region string, opt *ccom.VpcOpt) (*metadata.VpcsInfo, error) {
	f.calls = append(f.calls, fakeVendorCall{
		method:  "vpcs",
		region:  region,
		limit:   opt.Limit,
		filters: opt.Filters,
	})
	return f.vpcs, f.err
}

func (f *fakeVendorClient) GetInstances(region string, opt *ccom.InstanceOpt) (*metadata.InstancesInfo, error) {
	f.calls = append(f.calls, fakeVendorCall{
		method:  "instances",
		region:  region,
		limit:   opt.Limit,
		filters: opt.Filters,
	})
	return f.instances, f.err
}

func (f *fakeVendorClient) GetInstancesTotalCnt(region string, opt *ccom.InstanceOpt) (int64, error) {
	f.calls = append(f.calls, fakeVendorCall{
		method:  "instances_total_count",
		region:  region,
		limit:   opt.Limit,
		filters: opt.Filters,
	})
	return f.totalCnt, f.err
}

func TestVendorClientRegisterAndGetVendorClient(t *testing.T) {
	const vendorName = "g1-c-contract-fake"
	prototype := &fakeVendorClient{}
	Register(vendorName, prototype)

	client, err := GetVendorClient(metadata.CloudAccountConf{
		VendorName: vendorName,
		SecretID:   "fake-secret-id",
		SecretKey:  "fake-secret-key",
	})

	require.NoError(t, err)
	got, ok := client.(*fakeVendorClient)
	require.True(t, ok)
	assert.Equal(t, "fake-secret-id", got.secretIDSeen)
	assert.Equal(t, "fake-secret-key", got.secretKeySeen)
}

func TestGetVendorClientUnsupportedVendor(t *testing.T) {
	client, err := GetVendorClient(metadata.CloudAccountConf{VendorName: "g1-c-unsupported"})

	require.Nil(t, client)
	require.EqualError(t, err, "vendor g1-c-unsupported is not supported")
}

func TestFakeVendorClientReturnsRegionsVpcsInstancesAndTotalCount(t *testing.T) {
	filterName := "vpc-id"
	filterValue := "vpc-1"
	filter := &ccom.Filter{Name: &filterName, Values: []*string{&filterValue}}
	vpcOpt := &ccom.VpcOpt{BaseOpt: ccom.BaseOpt{Limit: 1, Filters: []*ccom.Filter{filter}}}
	instanceOpt := &ccom.InstanceOpt{BaseOpt: ccom.BaseOpt{Limit: 2, Filters: []*ccom.Filter{filter}}}
	fake := &fakeVendorClient{
		regions: []*metadata.Region{{RegionId: "region-1", RegionName: "Region 1", RegionState: "up"}},
		vpcs: &metadata.VpcsInfo{
			Count:  2,
			VpcSet: []*metadata.Vpc{{VpcId: "vpc-1", VpcName: "VPC 1"}},
		},
		instances: &metadata.InstancesInfo{
			Count:       3,
			InstanceSet: []*metadata.Instance{{InstanceId: "instance-1", VpcId: "vpc-1"}},
		},
		totalCnt: 3,
	}

	regions, err := fake.GetRegions()
	require.NoError(t, err)
	assert.Equal(t, fake.regions, regions)

	vpcs, err := fake.GetVpcs("region-1", vpcOpt)
	require.NoError(t, err)
	assert.Equal(t, fake.vpcs, vpcs)

	instances, err := fake.GetInstances("region-1", instanceOpt)
	require.NoError(t, err)
	assert.Equal(t, fake.instances, instances)

	totalCnt, err := fake.GetInstancesTotalCnt("region-1", instanceOpt)
	require.NoError(t, err)
	assert.Equal(t, int64(3), totalCnt)

	require.Len(t, fake.calls, 3)
	assert.Equal(t, fakeVendorCall{method: "vpcs", region: "region-1", limit: 1, filters: []*ccom.Filter{filter}}, fake.calls[0])
	assert.Equal(t, fakeVendorCall{method: "instances", region: "region-1", limit: 2, filters: []*ccom.Filter{filter}}, fake.calls[1])
	assert.Equal(t, fakeVendorCall{method: "instances_total_count", region: "region-1", limit: 2, filters: []*ccom.Filter{filter}}, fake.calls[2])
}

func TestFakeVendorClientPropagatesErrors(t *testing.T) {
	expectedErr := errors.New("fake vendor unavailable")
	fake := &fakeVendorClient{err: expectedErr}
	opt := &ccom.InstanceOpt{BaseOpt: ccom.BaseOpt{Limit: 1}}

	regions, err := fake.GetRegions()
	require.Nil(t, regions)
	require.ErrorIs(t, err, expectedErr)

	vpcs, err := fake.GetVpcs("region-1", &ccom.VpcOpt{BaseOpt: ccom.BaseOpt{Limit: 1}})
	require.Nil(t, vpcs)
	require.ErrorIs(t, err, expectedErr)

	instances, err := fake.GetInstances("region-1", opt)
	require.Nil(t, instances)
	require.ErrorIs(t, err, expectedErr)

	totalCnt, err := fake.GetInstancesTotalCnt("region-1", opt)
	assert.Zero(t, totalCnt)
	require.ErrorIs(t, err, expectedErr)
}
