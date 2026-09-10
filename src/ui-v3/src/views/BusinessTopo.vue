<template>
  <div class="topo-page">
    <h1 class="page-title sr-only">业务拓扑</h1>
    <div class="topo-body">
      <!-- 左:拓扑树(对齐旧版:无卡片边框,顶部关键词过滤) -->
      <div class="tree-col">
        <el-input v-model="keyword" placeholder="请输入关键词" size="small" clearable suffix-icon="Search" style="margin-bottom: 8px" />
        <el-tree
          ref="treeRef"
          :data="treeData"
          :props="{ label: 'label', children: 'children' }"
          default-expand-all
          node-key="id"
          :current-node-key="currentKey"
          highlight-current
          :expand-on-click-node="false"
          v-loading="loading"
          @node-click="onNodeClick"
          @node-contextmenu="onNodeContextmenu"
        >
          <template #default="{ data }">
            <span class="tree-node">
              <i :class="['bk-cmdb-icon', 'node-icon', nodeIconClass(data), { 'node-icon-biz': data.type === 'biz' }]" />
              <span class="node-label">{{ data.label }}</span>
              <span v-if="data.hostCount != null" class="node-count">{{ data.hostCount }}</span>
              <el-button v-if="canCreate(data)" link size="small" type="primary" class="node-add"
                @click.stop="openCreateFromNode(data)">+</el-button>
            </span>
          </template>
        </el-tree>
      </div>

      <!-- 右:主机列表 / 服务实例 / 节点信息 -->
      <div class="main-col">
        <el-tabs v-model="rightTab" class="right-tabs">
          <el-tab-pane label="主机列表" name="host" />
          <el-tab-pane label="服务实例" name="instance" />
          <el-tab-pane label="节点信息" name="node" />
        </el-tabs>

        <!-- 工具栏 -->
        <div class="toolbar" v-if="rightTab !== 'node'">
          <template v-if="rightTab === 'host'">
            <el-button size="small" type="primary" :disabled="!bizId" @click="openCreateSet">新增</el-button>
            <el-button size="small" :disabled="!selectedHosts.length" @click="openTopoBatchEdit">编辑</el-button>
            <el-dropdown trigger="click" @command="onTransferCmd">
              <el-button size="small" :disabled="!selectedHosts.length">转移至<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="module">业务模块</el-dropdown-item>
                  <el-dropdown-item command="idle">转移至空闲机池</el-dropdown-item>
                  <el-dropdown-item command="resource">转移到资源池</el-dropdown-item>
                  <el-dropdown-item command="across">跨业务转移</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
            <el-dropdown trigger="click">
              <el-button size="small" :disabled="!selectedHosts.length" @click="appendVisible = true">追加至<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
            </el-dropdown>
            <el-dropdown trigger="click" @command="onCopyCmd">
              <el-button size="small" :disabled="!selectedHosts.length">复制<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="ip">复制IP</el-dropdown-item>
                  <el-dropdown-item command="name">复制主机名称</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
            <el-dropdown trigger="click" @command="onMoreCmd">
              <el-button size="small" :disabled="!selectedHosts.length">更多<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="exportSelected">导出选中</el-dropdown-item>
                  <el-dropdown-item command="exportAll">导出全部</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </template>
          <template v-else>
            <el-button size="small" type="primary" :disabled="!currentModuleId" @click="openSvcInstWizard">新建服务实例</el-button>
            <el-dropdown trigger="click" @command="onInstMore">
              <el-button size="small">更多</el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item :disabled="!selectedInstances.length" command="editLabels">编辑标签</el-dropdown-item>
                  <el-dropdown-item :disabled="!selectedInstances.length" command="delete" divided>批量删除</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </template>
          <div class="spacer" />
          <template v-if="rightTab === 'host'">
            <el-tooltip content="收藏当前筛选条件" placement="top">
              <el-button size="small" :icon="'Star'" class="square-btn" @click="saveFavorite" />
            </el-tooltip>
            <el-popover placement="bottom-end" :width="260" trigger="click">
              <template #reference>
                <el-button size="small" :icon="'Filter'" class="square-btn" />
              </template>
              <div class="filter-pop">
                <div class="filter-row-label">集群</div>
                <el-select v-model="filterSetId" placeholder="全部集群" clearable size="small" style="width: 100%" @change="onFilterChange">
                  <el-option v-for="n in setNodes" :key="n.id" :label="n.label" :value="n.id" />
                </el-select>
                <div class="filter-row-label">模块</div>
                <el-select v-model="filterModuleId" placeholder="全部模块" clearable size="small" style="width: 100%" @change="onFilterChange">
                  <el-option v-for="n in moduleNodes" :key="n.id" :label="n.label" :value="n.id" />
                </el-select>
              </div>
            </el-popover>
          </template>
          <el-button size="small" :icon="'Refresh'" @click="load">刷新</el-button>
          <span class="refresh-time">{{ refreshText }}</span>
          <el-input
            v-model="ipKeyword"
            :placeholder="rightTab === 'host' ? '请输入IP或固资编号' : '请输入实例名称'"
            size="small"
            clearable
            style="width: 220px; margin-left: 8px"
            @keyup.enter="rightTab === 'host' ? loadHosts() : loadInstances()"
            @clear="rightTab === 'host' ? loadHosts() : loadInstances()"
          />
        </div>

        <!-- 主机列表 -->
        <template v-if="rightTab === 'host'">
          <el-table
            :data="hosts"
            v-loading="hostLoading"
            size="small"
            class="bk-table"
            @selection-change="onHostSelect"
          >
            <el-table-column type="selection" width="36" />
            <el-table-column label="ID" width="80">
              <template #default="{ row }">
                <el-link type="primary" :underline="false" @click="goHostDetail(row)">{{ row.bk_host_id }}</el-link>
              </template>
            </el-table-column>
            <el-table-column
              v-for="col in activeHostColumns"
              :key="col.bk_property_id"
              :prop="col.bk_property_id"
              :label="col.bk_property_name"
              :min-width="col.minWidth || 120"
              sortable
              show-overflow-tooltip
            >
              <template #default="{ row }">
                <el-link v-if="col.bk_property_id === 'bk_host_innerip'" type="primary" :underline="false"
                  @click="goHostDetail(row)">{{ row.bk_host_innerip || '--' }}</el-link>
                <span v-else>{{ hostCell(row, col.bk_property_id) }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="__moduleName" label="模块名 (模块)" min-width="130" sortable>
              <template #default="{ row }">{{ row.__moduleName || '--' }}</template>
            </el-table-column>
            <el-table-column prop="__setName" label="集群名 (集群)" min-width="130" sortable>
              <template #default="{ row }">{{ row.__setName || '--' }}</template>
            </el-table-column>
          </el-table>
          <div class="table-footer">
            <span>共计{{ hostTotal }}条</span>
            <span class="selected-info">已选择{{ selectedHosts.length }}条</span>
            <div class="spacer" />
            <el-pagination
              v-model:current-page="hostPage"
              :page-size="hostPageSize"
              :total="hostTotal"
              :page-sizes="[10, 20, 50, 100]"
              layout="sizes, prev, pager, next"
              small
              @current-change="loadHosts"
              @size-change="onHostPageSizeChange"
            />
            <el-popover placement="bottom-end" :width="220" trigger="click" v-model:visible="colPickerVisible">
              <template #reference>
                <el-button size="small" :icon="'Setting'" class="col-set">字段设置</el-button>
              </template>
              <div class="col-picker">
                <div class="col-picker-title">已显示字段(可拖动排序)</div>
                <el-checkbox-group v-model="pickedColumnIds">
                  <div v-for="col in hostColumnPool" :key="col.bk_property_id" class="col-picker-row">
                    <el-checkbox :value="col.bk_property_id">{{ col.bk_property_name }}</el-checkbox>
                  </div>
                </el-checkbox-group>
                <div class="col-picker-actions">
                  <el-button size="small" @click="resetColumns">恢复默认</el-button>
                  <el-button size="small" type="primary" @click="colPickerVisible = false">关闭</el-button>
                </div>
              </div>
            </el-popover>
          </div>
        </template>

        <!-- 服务实例 -->
        <template v-if="rightTab === 'instance'">
          <el-table :data="svcInstances" v-loading="instLoading" size="small" class="bk-table"
            @selection-change="onInstanceSelect">
            <el-table-column type="selection" width="36" />
            <el-table-column label="实例名称" min-width="200" show-overflow-tooltip>
              <template #default="{ row }">
                <el-link type="primary" :underline="false" @click="openInstanceDrawer(row)">{{ row.name || `实例 ${row.id}` }}</el-link>
              </template>
            </el-table-column>
            <el-table-column label="主机" width="140">
              <template #default="{ row }">{{ row.bk_host_innerip || row.host?.bk_host_innerip || '-' }}</template>
            </el-table-column>
            <el-table-column label="进程数" width="90">
              <template #default="{ row }">{{ row.process_count ?? '-' }}</template>
            </el-table-column>
            <el-table-column label="操作" width="180" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" @click="openInstanceDrawer(row)">查看/编辑进程</el-button>
                <el-button link type="primary" @click="openClone(row)">克隆</el-button>
                <el-button link type="danger" @click="removeInstance(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div class="table-footer">
            <span>共计{{ svcInstances.length }}条</span>
            <span class="selected-info">已选择{{ selectedInstances.length }}条</span>
          </div>
          <el-empty v-if="!instLoading && svcInstances.length === 0" description="暂无服务实例(选中模块后可点击「新建服务实例」)" :image-size="60" />
        </template>

        <!-- 节点信息 -->
        <template v-if="rightTab === 'node'">
          <!-- 业务根节点:基础信息 + 角色(旧版三列 label: value) -->
          <div v-if="currentNode && currentNode.type === 'biz'" class="node-info" v-loading="bizInfoLoading">
            <div v-for="grp in bizInfoGroups" :key="grp.bk_group_id" class="info-group">
              <div class="info-group-header" @click="toggleInfoGroup(grp)">
                <i :class="['bk-cmdb-icon icon-cc-triangle info-group-arrow', { collapsed: infoGroupCollapse[grp.bk_group_id] }]" />
                <span class="info-group-title">{{ grp.bk_group_name }}</span>
              </div>
              <div v-show="!infoGroupCollapse[grp.bk_group_id]" class="info-grid">
                <div v-for="p in grp.properties" :key="p.bk_property_id" class="info-item">
                  <span class="info-label">{{ p.bk_property_name }}：</span>
                  <span class="info-value">{{ bizFieldValue(p) }}</span>
                </div>
              </div>
            </div>
          </div>
          <el-descriptions v-else-if="currentNode && currentNode.type !== 'biz'" :column="1" border size="small" style="max-width: 560px">
            <el-descriptions-item label="节点类型">{{ nodeTypeName(currentNode.type) }}</el-descriptions-item>
            <el-descriptions-item label="节点名称">{{ currentNode.label }}</el-descriptions-item>
            <el-descriptions-item label="实例 ID">{{ currentNode.setId || currentNode.moduleId || '-' }}</el-descriptions-item>
            <el-descriptions-item label="主机数量">{{ currentNode.hostCount ?? '-' }}</el-descriptions-item>
          </el-descriptions>
          <el-empty v-else description="请在左侧选择集群或模块节点" :image-size="60" />
        </template>

        <el-empty v-if="!bizId" description="请先在左侧顶部选择业务" :image-size="70" />
      </div>
    </div>

    <!-- 右键菜单:树节点 -->
    <ul v-show="ctxMenu.visible" class="ctx-menu"
      :style="{ left: ctxMenu.x + 'px', top: ctxMenu.y + 'px' }"
      @mouseleave="ctxMenu.visible = false">
      <li class="ctx-item" v-if="ctxMenu.node && canCreate(ctxMenu.node)" @click="ctxCreateSet">新建集群</li>
      <li class="ctx-item" v-if="ctxMenu.node && ctxMenu.node.type === 'set' && !ctxMenu.node.isIdle"
        @click="ctxCreateModule">新建模块</li>
      <li class="ctx-item ctx-danger" v-if="ctxMenu.node && ctxMenu.node.type === 'set' && !ctxMenu.node.isIdle"
        @click="ctxDeleteSet">删除集群</li>
      <li class="ctx-item ctx-danger" v-if="ctxMenu.node && ctxMenu.node.type === 'module'"
        @click="ctxDeleteModule">删除模块</li>
      <li class="ctx-item" v-if="ctxMenu.node && ctxMenu.node.type === 'module'"
        @click="ctxOpenSvcInstWizard">新建服务实例</li>
    </ul>

    <!-- 新建集群 / 模块 -->
    <el-dialog v-model="nodeDialog" :title="nodeDialogType === 'set' ? '新建集群' : '新建模块'" width="420px">
      <el-form label-width="90px" @submit.prevent>
        <el-form-item :label="nodeDialogType === 'set' ? '集群名称' : '模块名称'" required>
          <el-input v-model="nodeName" placeholder="输入名称" />
        </el-form-item>
        <el-form-item v-if="nodeDialogType === 'module'" label="所属集群">
          <span>{{ nodeParent?.label }}</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="nodeDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveNode">保存</el-button>
      </template>
    </el-dialog>

    <!-- 转移 / 追加 -->
    <el-dialog v-model="transferVisible" :title="transferMode === 'move' ? '转移主机' : '追加主机'" width="440px">
      <el-form label-width="90px">
        <el-form-item label="目标模块" required>
          <el-cascader
            v-model="targetModule"
            :options="moduleOptions"
            :props="{ value: 'value', label: 'label', children: 'children', emitPath: false }"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="主机">
          <span>{{ selectedHosts.length }} 台</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="transferVisible = false">取消</el-button>
        <el-button type="primary" :loading="transferring" @click="doTransfer">确定</el-button>
      </template>
    </el-dialog>
    <el-dialog v-model="appendVisible" title="追加主机" width="440px">
      <el-form label-width="90px">
        <el-form-item label="目标模块" required>
          <el-cascader
            v-model="appendModule"
            :options="moduleOptions"
            :props="{ value: 'value', label: 'label', children: 'children', emitPath: false }"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="主机">
          <span>{{ selectedHosts.length }} 台(保留原模块)</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="appendVisible = false">取消</el-button>
        <el-button type="primary" :loading="transferring" @click="doAppend">确定</el-button>
      </template>
    </el-dialog>

    <!-- 服务实例向导:选主机 → 加进程 -->
    <el-dialog v-model="wizardVisible" title="新建服务实例" width="720px" top="6vh">
      <el-steps :active="wizardStep" finish-status="success" simple style="margin-bottom: 16px">
        <el-step title="选择主机" />
        <el-step title="配置进程" />
        <el-step title="完成" />
      </el-steps>

      <template v-if="wizardStep === 0">
        <el-alert type="info" :closable="false" style="margin-bottom: 8px"
          :title="`所属模块:${currentNode?.label || '-'} (服务实例名称留空将自动按「{IP}_序号」生成)`" />
        <el-table :data="candidateHosts" v-loading="candLoading" size="small" max-height="380"
          @selection-change="onCandSelect">
          <el-table-column type="selection" width="36" />
          <el-table-column label="内网IP" min-width="140">
            <template #default="{ row }">{{ row.bk_host_innerip || '--' }}</template>
          </el-table-column>
          <el-table-column label="主机名" min-width="140">
            <template #default="{ row }">{{ row.bk_host_name || '--' }}</template>
          </el-table-column>
          <el-table-column label="操作系统" min-width="120">
            <template #default="{ row }">{{ row.bk_os_name || '--' }}</template>
          </el-table-column>
        </el-table>
        <div class="hint" v-if="currentModuleId && candidateHosts.length === 0 && !candLoading">
          该模块下没有可绑定的主机(可在主机列表/资源池把主机转移到该模块)
        </div>
      </template>

      <template v-else-if="wizardStep === 1">
        <el-button :icon="'Plus'" size="small" @click="addWizardProcess">添加进程</el-button>
        <el-button size="small" :disabled="wizardInstances.length === 0" @click="removeWizardInstance">移除主机</el-button>
        <el-table :data="wizardInstances" size="small" max-height="380" style="margin-top: 8px">
          <el-table-column label="主机" min-width="160">
            <template #default="{ row }">
              <div>{{ row.__host?.bk_host_innerip || `主机 ${row.bk_host_id}` }}</div>
              <el-input v-model="row.service_instance_name" placeholder="实例名称(留空自动生成)" size="small" />
            </template>
          </el-table-column>
          <el-table-column label="进程配置" min-width="360">
            <template #default="{ row }">
              <div v-for="(p, i) in row.processes" :key="i" class="proc-row">
                <el-input v-model="p.process_info.bk_func_name" placeholder="进程名称(必填)" size="small" style="width: 140px" />
                <el-input v-model="p.process_info.port" placeholder="端口" size="small" style="width: 80px" />
                <el-input v-model="p.process_info.bk_bind_ip" placeholder="监听IP" size="small" style="width: 130px" />
                <el-button link type="danger" size="small" @click="row.processes.splice(i, 1)">删除</el-button>
              </div>
              <el-button v-if="row.processes.length === 0" link type="primary" size="small"
                @click="row.processes.push(emptyProc())">+ 添加进程</el-button>
            </template>
          </el-table-column>
        </el-table>
      </template>

      <template v-else>
        <el-result icon="success" title="已创建" :sub-title="`本次创建 ${wizardCreatedCount} 个服务实例`">
          <template #extra>
            <el-button type="primary" @click="closeWizard">完成</el-button>
          </template>
        </el-result>
      </template>

      <template #footer v-if="wizardStep < 2">
        <el-button @click="wizardVisible = false">取消</el-button>
        <el-button v-if="wizardStep === 0" type="primary" :disabled="wizardSelectedHosts.length === 0"
          @click="goWizardStep(1)">下一步</el-button>
        <template v-else>
          <el-button @click="goWizardStep(0)">上一步</el-button>
          <el-button type="primary" :loading="wizardSubmitting" @click="submitWizard">提交</el-button>
        </template>
      </template>
    </el-dialog>

    <!-- 跨业务转移 -->
    <el-dialog v-model="acrossVisible" title="跨业务转移" width="520px">
      <el-form label-width="110px">
        <el-form-item label="转移主机">
          <span>已选择 {{ selectedHosts.length }} 台</span>
        </el-form-item>
        <el-form-item label="目标业务" required>
          <el-select
            v-model="acrossForm.dstBiz"
            filterable
            style="width: 100%"
            placeholder="请选择目标业务"
            @change="loadAcrossModuleOptions"
          >
            <el-option v-for="b in acrossBizOptions" :key="b.bk_biz_id" :label="`[${b.bk_biz_id}] ${b.bk_biz_name}`" :value="b.bk_biz_id" />
          </el-select>
        </el-form-item>
        <el-form-item label="目标模块" required>
          <el-cascader
            v-model="acrossForm.modulePath"
            :options="acrossModules"
            :props="{ value: 'value', label: 'label', children: 'children', emitPath: false }"
            placeholder="选择集群 / 模块"
            style="width: 100%"
            :disabled="!acrossForm.dstBiz"
            v-loading="acrossLoading"
          />
        </el-form-item>
      </el-form>
      <div class="field-tip" style="padding-left: 110px">转移后主机将从当前业务模块移除,归属目标业务的所选模块</div>
      <template #footer>
        <el-button @click="acrossVisible = false">取消</el-button>
        <el-button type="primary" :loading="acrossSubmitting" @click="submitAcrossTransfer">确认转移</el-button>
      </template>
    </el-dialog>

    <!-- 批量编辑主机属性(契约 PUT /hosts/batch) -->
    <el-drawer v-model="topoBatchVisible" title="编辑主机属性" size="480px">
      <el-form label-width="120px">
        <el-form-item v-for="f in topoBatchAttrs" :key="f.bk_property_id" :label="f.bk_property_name">
          <el-select v-if="topoEnumOptions(f).length" v-model="topoBatchMap[f.bk_property_id]" clearable filterable style="width: 100%">
            <el-option v-for="o in topoEnumOptions(f)" :key="o.id" :label="o.name" :value="o.id" />
          </el-select>
          <el-switch v-else-if="f.bk_property_type === 'bool'" v-model="topoBatchMap[f.bk_property_id]" />
          <el-input-number v-else-if="f.bk_property_type === 'int'" v-model="topoBatchMap[f.bk_property_id]" :controls="false" style="width: 100%" />
          <el-input v-else v-model="topoBatchMap[f.bk_property_id]" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="topoBatchVisible = false">取消</el-button>
        <el-button type="primary" :loading="topoBatchSaving" @click="submitTopoBatchEdit">保存</el-button>
      </template>
    </el-drawer>

    <!-- 服务实例克隆 -->
    <el-dialog v-model="cloneVisible" :title="`克隆服务实例「${cloneSource?.name || ''}」`" width="480px">
      <el-form label-width="100px">
        <el-form-item label="目标模块" required>
          <el-cascader
            v-model="cloneModulePath"
            :options="moduleOptions"
            :props="{ value: 'value', label: 'label', children: 'children', emitPath: false }"
            placeholder="选择集群 / 模块"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="进程配置">
          <span>将复制源实例的全部 {{ cloneProcesses.length }} 个进程</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="cloneVisible = false">取消</el-button>
        <el-button type="primary" :loading="cloneSubmitting" @click="submitClone">克隆</el-button>
      </template>
    </el-dialog>

    <!-- 批量编辑标签 -->
    <el-dialog v-model="labelVisible" :title="`编辑标签(${selectedInstances.length} 个实例)`" width="520px">
      <div v-for="(row, idx) in labelRows" :key="idx" class="label-row">
        <el-input v-model="row.key" placeholder="标签键" style="width: 200px" />
        <span class="label-eq">=</span>
        <el-input v-model="row.value" placeholder="标签值" style="width: 200px" />
        <el-button link type="danger" :icon="'Delete'" @click="labelRows.splice(idx, 1)" />
      </div>
      <el-button text type="primary" :icon="'Plus'" @click="labelRows.push({ key: '', value: '' })">添加标签</el-button>
      <template #footer>
        <el-button @click="labelVisible = false">取消</el-button>
        <el-button type="primary" :loading="labelSaving" @click="submitLabels">应用</el-button>
      </template>
    </el-dialog>

    <!-- 服务实例进程抽屉(从实例列表 / 向导完成后跳入) -->
    <el-drawer v-model="procDrawer" :title="`「${procInstName}」进程实例`" size="55%">
      <div class="table-toolbar">
        <div class="spacer" />
        <el-button :icon="'Plus'" type="primary" size="small" @click="openAddProcess">新增进程</el-button>
      </div>
      <el-table :data="processes" v-loading="procLoading" size="default">
        <el-table-column label="进程名称" min-width="130">
          <template #default="{ row }">{{ row.property?.bk_func_name || '-' }}</template>
        </el-table-column>
        <el-table-column label="监听 IP" width="130">
          <template #default="{ row }">{{ row.property?.bk_bind_ip || '-' }}</template>
        </el-table-column>
        <el-table-column label="端口" width="110">
          <template #default="{ row }">{{ row.property?.port || '-' }}</template>
        </el-table-column>
        <el-table-column label="启动用户" width="110">
          <template #default="{ row }">{{ row.property?.user || '-' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEditProcess(row)">编辑</el-button>
            <el-button link type="danger" @click="removeProcess(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!procLoading && processes.length === 0" description="该服务实例暂无进程,可点击右上角「新增进程」" :image-size="80" />
    </el-drawer>

    <ProcessFormDialog
      :visible="procFormVisible"
      :title="procEditing ? '编辑进程' : '新增进程'"
      mode="instance"
      :form="procForm"
      :saving="procSaving"
      @update:visible="procFormVisible = $event"
      @save="saveProcess"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowDown } from '@element-plus/icons-vue'
import {
  getBizTopoTree, getBizInternalTopo, listBizHosts,
  createSet, deleteSet, createModule, deleteModule,
  transferHostModule, transferHostToResource, transferBizHostAcrossBiz,
  searchServiceInstances, deleteServiceInstances, searchProcessInstances, updateProcessInstance, createInstanceLabels,
  listHostsWithNoSvcInst, createServiceInstance, createProcessInstance,
  searchModelAttributes, exportHosts,
  searchBusinessById, searchFieldGroups,
  http
} from '../api/cmdb'
import { useBizStore } from '../stores/biz'
import ProcessFormDialog from '../components/ProcessFormDialog.vue'

const route = useRoute()
const router = useRouter()
const bizStore = useBizStore()
const bizId = computed(() => Number(route.query.biz || route.params.bizId || bizStore.bizId) || null)

const keyword = ref('')
const treeData = ref([])
const hosts = ref([])
const hostTotal = ref(0)
const selectedHosts = ref([])
const loading = ref(false)
const hostLoading = ref(false)
const rightTab = ref(route.query.tab === 'instance' ? 'instance' : 'host')
const svcInstances = ref([])
const selectedInstances = ref([])
const instLoading = ref(false)
const refreshText = ref('')
const currentNode = ref(null)

// ---------- 业务节点信息(基础信息 + 角色,旧版节点信息 tab) ----------
const bizInfoLoading = ref(false)
const bizInfoData = ref(null)
const bizInfoGroups = ref([])
const infoGroupCollapse = ref({})
let bizInfoLoadedFor = null

async function loadBizNodeInfo() {
  if (!bizId.value) return
  bizInfoLoading.value = true
  try {
    const [detail, grpRes, attrRes] = await Promise.all([
      searchBusinessById(bizId.value),
      searchFieldGroups('biz').catch(() => ({ info: [] })),
      searchModelAttributes('biz').catch(() => [])
    ])
    bizInfoData.value = detail?.info?.[0] || null

    const groups = (grpRes?.info || [])
      .slice()
      .sort((a, b) => (a.bk_group_index ?? 999) - (b.bk_group_index ?? 999))
    const byGroup = new Map()
    for (const g of groups) byGroup.set(g.bk_group_id, { ...g, properties: [] })
    for (const p of (attrRes || []).slice().sort((a, b) => (a.bk_property_index ?? 999) - (b.bk_property_index ?? 999))) {
      const gid = p.bk_property_group
      if (!byGroup.has(gid)) continue
      byGroup.get(gid).properties.push(p)
    }
    bizInfoGroups.value = groups.map((g) => byGroup.get(g.bk_group_id)).filter((g) => g && g.properties.length)
    for (const g of bizInfoGroups.value) {
      if (infoGroupCollapse.value[g.bk_group_id] === undefined) infoGroupCollapse.value[g.bk_group_id] = false
    }
  } finally {
    bizInfoLoading.value = false
  }
}

function toggleInfoGroup(grp) {
  infoGroupCollapse.value[grp.bk_group_id] = !infoGroupCollapse.value[grp.bk_group_id]
}

function bizFieldValue(p) {
  const v = bizInfoData.value?.[p.bk_property_id]
  if (v === '' || v === null || v === undefined) return '--'
  if (p.bk_property_type === 'enum') {
    const opt = (Array.isArray(p.option) ? p.option : []).find((o) => String(o.id) === String(v))
    return opt ? (opt.name ?? v) : v
  }
  if (p.bk_property_type === 'time' || p.bk_property_type === 'date') {
    return String(v).replace('T', ' ').slice(0, 19)
  }
  if (p.bk_property_type === 'bool') return v ? '是' : '否'
  return v
}
const currentKey = ref('')

const nodeDialog = ref(false)
const nodeDialogType = ref('set')
const nodeName = ref('')
const nodeParent = ref(null)
const saving = ref(false)

const transferVisible = ref(false)
const appendVisible = ref(false)
const targetModule = ref(null)
const appendModule = ref(null)
const transferring = ref(false)
const moduleOptions = ref([])
const legacyDeleteIds = computed(() => String(route.query.deleteIds || '').split(',').map((id) => Number(id)).filter(Boolean))
const legacyModuleId = computed(() => Number(route.query.module) || null)

function applyLegacyInstanceContext() {
  if (rightTab.value === 'instance' && legacyModuleId.value) {
    currentNode.value = treeData.value.flatMap((node) => node.children || []).flatMap((set) => [set, ...(set.children || [])]).find((node) => node.moduleId === legacyModuleId.value) || currentNode.value
  }
  if (legacyDeleteIds.value.length) {
    ElMessage.info(`已保留 ${legacyDeleteIds.value.length} 个待处理实例，请在服务实例页确认后操作`)
  }
}

const ipKeyword = ref('')
const treeRef = ref(null)

// 主机分页
const hostPage = ref(1)
const hostPageSize = ref(20)

// 字段显示设置:候选字段池(可勾选)
const hostColumnPool = [
  { bk_property_id: 'bk_host_innerip', bk_property_name: '内网IPv4', minWidth: 140 },
  { bk_property_id: 'bk_host_outerip', bk_property_name: '外网IP', minWidth: 130 },
  { bk_property_id: 'bk_host_innerip_v6', bk_property_name: '内网IPv6', minWidth: 130 },
  { bk_property_id: 'bk_host_name', bk_property_name: '主机名', minWidth: 130 },
  { bk_property_id: 'bk_os_name', bk_property_name: '操作系统', minWidth: 110 },
  { bk_property_id: 'bk_cloud_id', bk_property_name: '管控区域', minWidth: 110 },
  { bk_property_id: 'bk_cpu', bk_property_name: 'CPU', minWidth: 80 },
  { bk_property_id: 'bk_mem', bk_property_name: '内存(GB)', minWidth: 90 },
  { bk_property_id: 'bk_disk', bk_property_name: '磁盘(GB)', minWidth: 90 },
  { bk_property_id: 'bk_isp_name', bk_property_name: '运营商', minWidth: 100 }
]
const DEFAULT_PICKED = ['bk_host_innerip', 'bk_host_innerip_v6', 'bk_cloud_id']
const PICK_KEY = 'topo.hostColumns'
const pickedColumnIds = ref([...DEFAULT_PICKED])
const colPickerVisible = ref(false)
const activeHostColumns = computed(() => {
  const map = new Map(hostColumnPool.map((c) => [c.bk_property_id, c]))
  return pickedColumnIds.value.map((id) => map.get(id)).filter(Boolean)
})

function hostCell(row, key) {
  if (key === 'bk_cloud_id') return cloudName(row[key])
  const v = row[key]
  return v === '' || v === null || v === undefined ? '--' : v
}
function loadPickedColumns() {
  try {
    const raw = localStorage.getItem(PICK_KEY)
    if (raw) pickedColumnIds.value = JSON.parse(raw)
  } catch (e) { /* ignore */ }
}
watch(pickedColumnIds, (v) => {
  try { localStorage.setItem(PICK_KEY, JSON.stringify(v)) } catch (e) { /* ignore */ }
}, { deep: true })
function resetColumns() {
  pickedColumnIds.value = [...DEFAULT_PICKED]
}

// 右键菜单
const ctxMenu = ref({ visible: false, x: 0, y: 0, node: null })
function onNodeContextmenu(event, data) {
  event.preventDefault()
  ctxMenu.value = { visible: true, x: event.clientX, y: event.clientY, node: data }
}

const names = { biz: '业务', set: '集群', module: '模块' }
const nodeTypeName = (t) => names[t] || t
function nodeBadge(data) {
  return { biz: '业', set: '集', module: '模' }[data.type] || '?'
}
function nodeIconClass(data) {
  return { biz: 'icon-cc-business', set: 'icon-cc-nav-set-topo', module: 'icon-cc-module' }[data.type] || 'icon-cc-host'
}
function canCreate(data) {
  // 业务根节点(biz)、模块、空闲集群节点不能新建
  return data.type === 'biz' || data.type === 'set'
}
const cloudNames = { 0: 'Default Area' }
function cloudName(id) {
  // with_biz 返回云区域关联对象数组;普通数值走内置映射
  if (Array.isArray(id)) {
    const c = id[0]
    if (!c) return '--'
    return `${c.bk_inst_name || 'Default Area'}[${c.bk_inst_id ?? 0}]`
  }
  const n = cloudNames[id]
  return n ? `${n}[${id}]` : '--'
}

const filteredTree = computed(() => {
  if (!keyword.value) return treeData.value
  const kw = keyword.value.toLowerCase()
  const filter = (nodes) => nodes
    .map((n) => {
      const children = filter(n.children || [])
      if ((n.label || '').toLowerCase().includes(kw) || children.length) return { ...n, children }
      return null
    })
    .filter(Boolean)
  return filter(treeData.value)
})

function mapTopoNode(node, parentSetId, moduleCount = {}, setCount = {}) {
  const setId = node.bk_obj_id === 'set' ? node.bk_inst_id : parentSetId
  return {
    type: node.bk_obj_id,
    id: `${node.bk_obj_id}-${node.bk_inst_id}`,
    setId,
    moduleId: node.bk_obj_id === 'module' ? node.bk_inst_id : undefined,
    label: node.bk_inst_name,
    hostCount: node.bk_obj_id === 'module'
      ? (moduleCount[node.bk_inst_id] || 0)
      : (node.bk_obj_id === 'set' ? (setCount[node.bk_inst_id] || 0) : undefined),
    children: (node.child || []).map((c) => mapTopoNode(c, setId, moduleCount, setCount))
  }
}

async function load() {
  if (!bizId.value) return
  loading.value = true
  currentNode.value = null
  try {
    const [mainTree, idleTopo, statRes] = await Promise.allSettled([
      getBizTopoTree(bizId.value),
      getBizInternalTopo(bizId.value),
      http.post('/findmany/hosts/search/with_biz', {
        bk_biz_id: bizId.value,
        condition: [
          { bk_obj_id: 'biz', fields: [] },
          { bk_obj_id: 'set', fields: [] },
          { bk_obj_id: 'module', fields: [] },
          { bk_obj_id: 'host', fields: [] }
        ],
        page: { start: 0, limit: 500 }
      })
    ])
    // 老版树计数为前端统计:按集群/模块归组
    let moduleCount = {}
    let setCount = {}
    let totalStat = 0
    if (statRes.status === 'fulfilled') {
      const rows = statRes.value?.info || []
      totalStat = statRes.value?.count ?? rows.length
      for (const r of rows) {
        for (const m of r.module || []) moduleCount[m.bk_module_id] = (moduleCount[m.bk_module_id] || 0) + 1
        for (const x of r.set || []) setCount[x.bk_set_id] = (setCount[x.bk_set_id] || 0) + 1
      }
    }
    // 对齐老版: 根业务节点 → 空闲机池在前 → 自定义集群
    let idleNode = null
    if (idleTopo.status === 'fulfilled' && idleTopo.value?.bk_set_id) {
      const s = idleTopo.value
      idleNode = {
        type: 'set',
        id: `set-${s.bk_set_id}`,
        setId: s.bk_set_id,
        label: s.bk_set_name,
        isIdle: true,
        hostCount: (s.module || []).reduce((a, m) => a + (moduleCount[m.bk_module_id] || 0), 0),
        children: (s.module || []).map((m) => ({
          type: 'module',
          id: `module-${m.bk_module_id}`,
          moduleId: m.bk_module_id,
          setId: s.bk_set_id,
          label: m.bk_module_name,
          hostCount: moduleCount[m.bk_module_id] || 0
        }))
      }
    }
    const customSets = []
    if (mainTree.status === 'fulfilled' && Array.isArray(mainTree.value)) {
      for (const bizNode of mainTree.value) {
        customSets.push(...(bizNode.child || []).map((c) => mapTopoNode(c, undefined, moduleCount, setCount)))
      }
    }
    const children = [...(idleNode ? [idleNode] : []), ...customSets]
    const totalHosts = totalStat || children.reduce((a, n) => a + (n.hostCount || 0), 0)
    const bizName = bizStore.bizList.find((b) => b.bk_biz_id === bizId.value)?.bk_biz_name || `业务 ${bizId.value}`
    const nodes = [{
      type: 'biz',
      id: `biz-${bizId.value}`,
      label: bizName,
      hostCount: totalHosts,
      children
    }]
    treeData.value = nodes
    await Promise.all([loadHosts(), loadInstances()])
    applyLegacyInstanceContext()
    const legacyAction = String(route.query.action || '')
    if (legacyAction === 'new-svc-instance' && currentModuleId.value) openSvcInstWizard()
  } finally {
    loading.value = false
  }
}

async function loadHosts() {
  if (!bizId.value) return
  hostLoading.value = true
  try {
    // 契约: HostCommonSearch 四对象关联查询,返回 host/set/module 关联数组(模块名/集群名列数据源)
    const node = currentNode.value
    const condition = [
      { bk_obj_id: 'biz', fields: [] },
      {
        bk_obj_id: 'set', fields: [],
        ...(node?.type === 'set' ? { condition: [{ field: 'bk_set_id', operator: '$eq', value: node.setId }] } : {})
      },
      {
        bk_obj_id: 'module', fields: [],
        ...(node?.type === 'module' ? { condition: [{ field: 'bk_module_id', operator: '$eq', value: node.moduleId }] } : {})
      },
      {
        bk_obj_id: 'host', fields: [],
        ...(ipKeyword.value ? { condition: [{ field: 'bk_host_innerip', operator: '$regex', value: ipKeyword.value }] } : {})
      }
    ]
    const data = await http.post(`/findmany/hosts/search/with_biz`, {
      bk_biz_id: bizId.value,
      condition,
      page: { start: (hostPage.value - 1) * hostPageSize.value, limit: hostPageSize.value, sort: 'bk_host_id' }
    })
    const list = (data?.info || []).map((h) => {
      const host = h.host || {}
      const mods = (h.module || []).map((m) => m.bk_module_name).filter(Boolean)
      const sets = (h.set || []).map((x) => x.bk_set_name).filter(Boolean)
      host.__moduleName = mods.length ? mods.join(',') : '--'
      host.__setName = sets.length ? sets.join(',') : '--'
      return host
    })
    hosts.value = list
    hostTotal.value = data?.count || 0
    refreshText.value = '刚刚刷新'
  } finally {
    hostLoading.value = false
  }
}

function onHostPageSizeChange(sz) {
  hostPageSize.value = sz
  hostPage.value = 1
  loadHosts()
}

async function loadInstances() {
  instLoading.value = true
  try {
    const data = await searchServiceInstances(bizId.value, { start: 0, limit: 200 })
    let rows = data?.info || []
    if (ipKeyword.value) {
      const kw = ipKeyword.value.toLowerCase()
      rows = rows.filter((r) => (r.name || '').toLowerCase().includes(kw) || (r.bk_host_innerip || '').toLowerCase().includes(kw))
    }
    svcInstances.value = rows
  } finally {
    instLoading.value = false
  }
}

function onNodeClick(node) {
  currentNode.value = node
  currentKey.value = node.id
  if (rightTab.value === 'host') loadHosts()
  else if (rightTab.value === 'instance') loadInstances()
}

function onHostSelect(rows) {
  selectedHosts.value = rows
}
function onInstanceSelect(rows) {
  selectedInstances.value = rows
}

function goHostDetail(row) {
  router.push({ path: '/host-detail', query: { id: row.bk_host_id, biz: bizId.value } })
}

async function loadModuleOptions() {
  const options = []
  const mapSet = (node) => ({
    value: node.bk_inst_id,
    label: node.bk_inst_name,
    children: (node.child || [])
      .filter((c) => c.bk_obj_id === 'module' || c.child)
      .map((c) => (c.bk_obj_id === 'module'
        ? { value: c.bk_inst_id, label: c.bk_inst_name }
        : mapSet(c)))
  })
  const [mainTree, idleTopo] = await Promise.allSettled([getBizTopoTree(bizId.value), getBizInternalTopo(bizId.value)])
  if (mainTree.status === 'fulfilled' && Array.isArray(mainTree.value)) {
    for (const bizNode of mainTree.value) options.push(...(bizNode.child || []).map(mapSet))
  }
  if (idleTopo.status === 'fulfilled' && idleTopo.value?.bk_set_id) {
    const s = idleTopo.value
    options.push({
      value: s.bk_set_id,
      label: s.bk_set_name,
      children: (s.module || []).map((m) => ({ value: m.bk_module_id, label: m.bk_module_name }))
    })
  }
  moduleOptions.value = options
}

async function doTransfer() {
  if (!targetModule.value) { ElMessage.warning('请选择目标模块'); return }
  // 对齐老版:选完目标模块进入转移确认页(preview→变更确认→执行)
  transferVisible.value = false
  router.push({
    path: `/business/${bizId.value}/host/transfer/${transferType.value}`,
    query: {
      resources: selectedHosts.value.map((h) => h.bk_host_id).join(','),
      targetModules: String(targetModule.value)
    }
  })
}

async function doAppend() {
  if (!appendModule.value) { ElMessage.warning('请选择目标模块'); return }
  appendVisible.value = false
  router.push({
    path: `/business/${bizId.value}/host/transfer/increment`,
    query: {
      resources: selectedHosts.value.map((h) => h.bk_host_id).join(','),
      targetModules: String(appendModule.value)
    }
  })
}

// ---------- 工具栏下拉/筛选/收藏/批量编辑 ----------
const transferType = ref('business')
function onTransferCmd(cmd) {
  if (!selectedHosts.value.length) return
  if (cmd === 'idle') {
    transferType.value = 'idle'
    transferVisible.value = true
  } else if (cmd === 'module') {
    transferType.value = 'business'
    transferVisible.value = true
  } else {
    onHostMore(cmd)
  }
}

async function onCopyCmd(cmd) {
  const hostsSel = selectedHosts.value
  const text = cmd === 'ip'
    ? hostsSel.map((h) => h.bk_host_innerip).filter(Boolean).join('\n')
    : hostsSel.map((h) => h.bk_host_name).filter(Boolean).join('\n')
  if (!text) { ElMessage.warning('所选主机无可复制内容'); return }
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success('复制成功')
  } catch { ElMessage.error('复制失败') }
}

async function onMoreCmd(cmd) {
  const ids = selectedHosts.value.map((h) => h.bk_host_id)
  try {
    await exportHosts(cmd === 'exportAll' ? [] : ids)
    ElMessage.success(cmd === 'exportAll' ? '已导出全部' : '已导出选中')
  } catch (e) {
    let msg = e?.message || '后端异常'
    if (e?.response?.data instanceof Blob) {
      try { msg = JSON.parse(await e.response.data.text()).bk_error_msg || msg } catch { /* 保留 */ }
    }
    ElMessage.error('导出失败: ' + msg)
  }
}

function saveFavorite() {
  const kw = ipKeyword.value.trim()
  if (!kw) { ElMessage.warning('请先输入筛选条件再收藏'); return }
  let favs = []
  try { favs = JSON.parse(localStorage.getItem('topo.hostFavorites') || '[]') } catch { favs = [] }
  if (!favs.includes(kw)) favs.push(kw)
  try { localStorage.setItem('topo.hostFavorites', JSON.stringify(favs)) } catch { /* ignore */ }
  ElMessage.success(`已收藏筛选条件「${kw}」`)
}

// 漏斗筛选: 树节点级联(集群/模块)
const filterSetId = ref(null)
const filterModuleId = ref(null)
const setNodes = computed(() => treeData.value.flatMap((r) => (r.children || []).filter((n) => n.type === 'set')))
const moduleNodes = computed(() => treeData.value.flatMap((r) => (r.children || []).flatMap((n) => n.type === 'set' ? (n.children || []).filter((c) => c.type === 'module') : [])))
function onFilterChange() {
  if (filterModuleId.value) {
    const mod = moduleNodes.value.find((n) => n.id === filterModuleId.value)
    if (mod) { onNodeClick(mod); return }
  }
  if (filterSetId.value) {
    const set = setNodes.value.find((n) => n.id === filterSetId.value)
    if (set) { onNodeClick(set); return }
  }
  const root = treeData.value[0]
  if (root) onNodeClick(root)
}

// 批量编辑主机属性(契约 PUT /hosts/batch,只提交变更字段)
const TOPO_BATCH_EXCLUDED = ['bk_host_id', 'bk_host_innerip', 'bk_host_outerip', 'bk_host_innerip_v6', 'bk_host_outerip_v6', 'bk_cloud_id', 'bk_biz_id', 'bk_supplier_account', 'bk_created_by', 'bk_created_at', 'bk_updated_by', 'bk_updated_at', 'create_time', 'last_time']
const topoBatchAttrs = ref([])
const topoBatchVisible = ref(false)
const topoBatchSaving = ref(false)
const topoBatchMap = ref({})
const topoBatchInit = ref({})

function topoEnumOptions(f) {
  return Array.isArray(f.option) ? f.option.filter((o) => o && o.id !== undefined) : []
}

async function openTopoBatchEdit() {
  if (!topoBatchAttrs.value.length) {
    const attrs = (await searchModelAttributes('host').catch(() => [])) || []
    topoBatchAttrs.value = attrs.filter((f) => !TOPO_BATCH_EXCLUDED.includes(f.bk_property_id))
  }
  const init = {}
  for (const f of topoBatchAttrs.value) {
    init[f.bk_property_id] = f.bk_property_type === 'bool' ? false : (['int', 'float'].includes(f.bk_property_type) ? undefined : '')
  }
  topoBatchInit.value = init
  topoBatchMap.value = { ...init }
  topoBatchVisible.value = true
}

async function submitTopoBatchEdit() {
  const isBlank = (v) => v === '' || v === null || v === undefined
  const changed = {}
  for (const [k, v] of Object.entries(topoBatchMap.value)) {
    if (!isBlank(v) && String(v) !== String(topoBatchInit.value[k] ?? '')) changed[k] = v
  }
  if (!Object.keys(changed).length) { ElMessage.warning('请先修改字段后再保存'); return }
  topoBatchSaving.value = true
  try {
    await http.put('/hosts/batch', { ...changed, bk_host_id: selectedHosts.value.map((h) => h.bk_host_id).join(',') })
    ElMessage.success(`已批量更新 ${selectedHosts.value.length} 台主机`)
    topoBatchVisible.value = false
    loadHosts()
  } catch (e) {
    ElMessage.error('批量编辑失败: ' + (e?.message || '后端异常'))
  } finally { topoBatchSaving.value = false }
}

async function onHostMore(cmd) {
  if (!selectedHosts.value.length) return
  if (cmd === 'resource') {
    await ElMessageBox.confirm(`将所选 ${selectedHosts.value.length} 台主机转移到资源池?`, '转移确认', { type: 'warning' })
    await transferHostToResource(bizId.value, selectedHosts.value.map((h) => h.bk_host_id))
    ElMessage.success('已转移至资源池')
    loadHosts()
    load()
  } else if (cmd === 'across') {
    acrossForm.value = { dstBiz: null, modulePath: null }
    acrossVisible.value = true
    loadAcrossModuleOptions()
  }
}

// ---------- 跨业务转移 ----------
const acrossVisible = ref(false)
const acrossForm = ref({ dstBiz: null, modulePath: null })
const acrossModules = ref([])
const acrossLoading = ref(false)
const acrossSubmitting = ref(false)
const acrossBizOptions = computed(() => bizStore.bizList.filter((b) => b.bk_biz_id !== bizId.value))

async function loadAcrossModuleOptions() {
  acrossModules.value = []
  if (!acrossForm.value.dstBiz) return
  acrossLoading.value = true
  try {
    const options = []
    const [mainTree, idleTopo] = await Promise.allSettled([getBizTopoTree(acrossForm.value.dstBiz), getBizInternalTopo(acrossForm.value.dstBiz)])
    const mapSet = (node) => ({
      value: node.bk_inst_id, label: node.bk_inst_name,
      children: (node.child || []).filter((c) => c.bk_obj_id === 'module' || c.child).map((c) => (c.bk_obj_id === 'module'
        ? { value: c.bk_inst_id, label: c.bk_inst_name } : mapSet(c)))
    })
    if (mainTree.status === 'fulfilled' && Array.isArray(mainTree.value)) {
      for (const bizNode of mainTree.value) options.push(...(bizNode.child || []).map(mapSet))
    }
    if (idleTopo.status === 'fulfilled' && idleTopo.value?.bk_set_id) {
      const s = idleTopo.value
      options.push({ value: s.bk_set_id, label: s.bk_set_name, children: (s.module || []).map((m) => ({ value: m.bk_module_id, label: m.bk_module_name })) })
    }
    acrossModules.value = options
  } finally { acrossLoading.value = false }
}

async function submitAcrossTransfer() {
  const hostIds = selectedHosts.value.map((h) => h.bk_host_id)
  if (!acrossForm.value.dstBiz || !acrossForm.value.modulePath) {
    ElMessage.warning('请选择目标业务与模块')
    return
  }
  try {
    await ElMessageBox.confirm(`将所选 ${hostIds.length} 台主机转移至目标业务的所选模块?`, '跨业务转移确认', { type: 'warning' })
  } catch { return }
  acrossSubmitting.value = true
  try {
    await transferBizHostAcrossBiz(bizId.value, acrossForm.value.dstBiz, hostIds, acrossForm.value.modulePath)
    ElMessage.success('跨业务转移成功')
    acrossVisible.value = false
    loadHosts()
    load()
  } catch (e) {
    ElMessage.error('跨业务转移失败: ' + (e?.message || '后端异常'))
  } finally { acrossSubmitting.value = false }
}

async function onInstMore(cmd) {
  if (cmd === 'editLabels') {
    if (!selectedInstances.value.length) return
    labelRows.value = [{ key: '', value: '' }]
    labelVisible.value = true
    return
  }
  if (cmd !== 'delete') return
  if (!selectedInstances.value.length) return
  await ElMessageBox.confirm(`确定删除选中的 ${selectedInstances.value.length} 个服务实例?`, '删除确认', { type: 'warning' })
  await deleteServiceInstances(bizId.value, selectedInstances.value.map((r) => r.id))
  ElMessage.success('已删除')
  loadInstances()
}

// ---- 新建集群 / 模块(工具栏 + 右键) ----
function openCreateSet() {
  openCreateFromNode({ type: 'biz' })
}
function openCreateFromNode(data) {
  if (data.type === 'biz' || data.type === 'set') {
    nodeDialogType.value = data.type === 'biz' ? 'set' : 'module'
    nodeParent.value = data.type === 'set' ? data : null
    nodeName.value = ''
    nodeDialog.value = true
  }
  ctxMenu.value.visible = false
}
function ctxCreateSet() {
  const n = ctxMenu.value.node
  ctxMenu.value.visible = false
  if (!n) return
  nodeDialogType.value = 'set'
  nodeParent.value = null
  nodeName.value = ''
  nodeDialog.value = true
}
function ctxCreateModule() {
  const n = ctxMenu.value.node
  ctxMenu.value.visible = false
  if (!n) return
  nodeDialogType.value = 'module'
  nodeParent.value = n
  nodeName.value = ''
  nodeDialog.value = true
}
async function ctxDeleteSet() {
  const n = ctxMenu.value.node
  ctxMenu.value.visible = false
  if (!n?.setId) return
  await ElMessageBox.confirm(`确定删除集群「${n.label}」?该集群下模块需先清空`, '删除确认', { type: 'warning' })
  await deleteSet(bizId.value, n.setId)
  ElMessage.success('集群已删除')
  load()
}
async function ctxDeleteModule() {
  const n = ctxMenu.value.node
  ctxMenu.value.visible = false
  if (!n?.moduleId) return
  await ElMessageBox.confirm(`确定删除模块「${n.label}」?`, '删除确认', { type: 'warning' })
  await deleteModule(bizId.value, n.setId, n.moduleId)
  ElMessage.success('模块已删除')
  load()
}

async function saveNode() {
  if (!nodeName.value) { ElMessage.warning('请输入名称'); return }
  saving.value = true
  try {
    if (nodeDialogType.value === 'set') {
      await createSet(bizId.value, nodeName.value)
    } else {
      await createModule(bizId.value, nodeParent.value.setId, nodeName.value)
    }
    ElMessage.success('创建成功')
    nodeDialog.value = false
    load()
  } finally {
    saving.value = false
  }
}

// ---------- 服务实例向导 ----------
const currentModuleId = computed(() => currentNode.value?.type === 'module' ? currentNode.value.moduleId : null)
const wizardVisible = ref(false)
const wizardStep = ref(0)
const wizardSelectedHosts = ref([])
const wizardInstances = ref([])
const wizardSubmitting = ref(false)
const wizardCreatedCount = ref(0)
const candidateHosts = ref([])
const candLoading = ref(false)

function emptyProc() {
  return {
    process_info: {
      bk_process_name: '',
      bk_func_name: '',
      bk_bind_ip: '127.0.0.1',
      port: '',
      user: 'root',
      work_path: '/tmp',
      start_cmd: '',
      stop_cmd: '',
      description: ''
    }
  }
}
function openSvcInstWizard() {
  if (!currentModuleId.value) {
    ElMessage.warning('请先在左侧选中一个模块节点')
    return
  }
  wizardStep.value = 0
  wizardSelectedHosts.value = []
  wizardInstances.value = []
  wizardCreatedCount.value = 0
  wizardVisible.value = true
  loadCandidateHosts()
}
function ctxOpenSvcInstWizard() {
  // 右键菜单触发时 currentNode 未必是当前节点,先切换再开向导
  const n = ctxMenu.value.node
  ctxMenu.value.visible = false
  if (n) {
    currentNode.value = n
    currentKey.value = n.id
  }
  openSvcInstWizard()
}

async function loadCandidateHosts() {
  if (!currentModuleId.value) return
  candLoading.value = true
  try {
    const data = await listHostsWithNoSvcInst(bizId.value, currentModuleId.value)
    const ids = data?.bk_host_ids || []
    if (ids.length === 0) {
      candidateHosts.value = []
      return
    }
    const hostData = await listBizHosts(bizId.value, { start: 0, limit: 500 })
    const all = (hostData?.info || []).map((h) => h.host || h)
    candidateHosts.value = all.filter((h) => ids.includes(h.bk_host_id))
  } finally {
    candLoading.value = false
  }
}
function onCandSelect(rows) {
  wizardSelectedHosts.value = rows
}
function goWizardStep(step) {
  if (step === 1) {
    wizardInstances.value = wizardSelectedHosts.value.map((h) => ({
      bk_host_id: h.bk_host_id,
      service_instance_name: '',
      __host: h,
      processes: [emptyProc()]
    }))
  }
  wizardStep.value = step
}
function addWizardProcess() {
  // 给当前所有 instance 各加一条进程
  wizardInstances.value.forEach((row) => row.processes.push(emptyProc()))
}
function removeWizardInstance() {
  // 移除最后一行
  wizardInstances.value.pop()
}

async function submitWizard() {
  // 校验所有主机至少一条合法进程
  for (const row of wizardInstances.value) {
    if (!row.processes.length) {
      ElMessage.warning('每台主机至少需要一个进程')
      return
    }
    for (const p of row.processes) {
      if (!p.process_info.bk_func_name) {
        ElMessage.warning('请填写所有进程的 bk_func_name')
        return
      }
      p.process_info.bk_process_name = p.process_info.bk_func_name
      if (p.process_info.port) p.process_info.port = String(p.process_info.port)
    }
  }
  wizardSubmitting.value = true
  try {
    await createServiceInstance(bizId.value, currentModuleId.value, wizardInstances.value.map((row) => ({
      bk_host_id: row.bk_host_id,
      service_instance_name: row.service_instance_name || '',
      processes: row.processes
    })))
    wizardCreatedCount.value = wizardInstances.value.length
    wizardStep.value = 2
    loadInstances()
  } catch (e) {
    console.error(e)
  } finally {
    wizardSubmitting.value = false
  }
}
function closeWizard() {
  wizardVisible.value = false
}

// ---------- 服务实例进程抽屉 ----------
const procDrawer = ref(false)
const procInstName = ref('')
const procInstId = ref(null)
const procLoading = ref(false)
const processes = ref([])
const procFormVisible = ref(false)
const procSaving = ref(false)
const procEditing = ref(null)
const procForm = ref({})

async function openInstanceDrawer(row) {
  procInstName.value = row.name || `实例 ${row.id}`
  procInstId.value = row.id
  procDrawer.value = true
  await refreshProcesses()
}
async function refreshProcesses() {
  procLoading.value = true
  try {
    const data = await searchProcessInstances(procInstId.value, { start: 0, limit: 100 })
    processes.value = data?.info || data || []
  } finally {
    procLoading.value = false
  }
}
function openAddProcess() {
  procEditing.value = null
  procForm.value = { bk_func_name: '', bk_process_name: '', bk_bind_ip: '127.0.0.1', port: '', user: 'root', work_path: '/tmp', start_cmd: '', stop_cmd: '', description: '' }
  procFormVisible.value = true
}
function openEditProcess(row) {
  procEditing.value = row
  procForm.value = {
    bk_process_id: row.property?.bk_process_id,
    bk_func_name: row.property?.bk_func_name || '',
    bk_process_name: row.property?.bk_process_name || '',
    bk_bind_ip: row.property?.bk_bind_ip || '127.0.0.1',
    port: row.property?.port || '',
    user: row.property?.user || 'root',
    work_path: row.property?.work_path || '/tmp',
    start_cmd: row.property?.start_cmd || '',
    stop_cmd: row.property?.stop_cmd || '',
    description: row.property?.description || ''
  }
  procFormVisible.value = true
}
async function saveProcess() {
  if (!procForm.value.bk_func_name) { ElMessage.warning('请输入进程名称'); return }
  procSaving.value = true
  try {
    const info = { ...procForm.value }
    if (info.port) info.port = String(info.port)
    if (procEditing.value) {
      const pid = info.bk_process_id
      delete info.bk_process_id
      await updateProcessInstance(bizId.value, [pid], info)
      ElMessage.success('进程已更新')
    } else {
      delete info.bk_process_id
      await createProcessInstance(procInstId.value, info)
      ElMessage.success('进程已创建')
    }
    procFormVisible.value = false
    await refreshProcesses()
    if (rightTab.value === 'instance') loadInstances()
  } finally {
    procSaving.value = false
  }
}
async function removeProcess(row) {
  const pid = row.property?.bk_process_id
  await ElMessageBox.confirm(`确定删除进程「${row.property?.bk_func_name || pid}」?`, '删除确认', { type: 'warning' })
  await http.delete('/delete/proc/process_instance', {
    bk_biz_id: bizId.value, process_instance_ids: [pid]
  })
  ElMessage.success('已删除')
  await refreshProcesses()
  if (rightTab.value === 'instance') loadInstances()
}
// ---------- 服务实例克隆 ----------
const cloneVisible = ref(false)
const cloneSource = ref(null)
const cloneModulePath = ref(null)
const cloneProcesses = ref([])
const cloneSubmitting = ref(false)

async function openClone(row) {
  cloneSource.value = row
  cloneModulePath.value = null
  cloneVisible.value = true
  try {
    const data = await searchProcessInstances(row.id, { start: 0, limit: 100 })
    cloneProcesses.value = data?.info || []
  } catch { cloneProcesses.value = [] }
}

async function submitClone() {
  if (!cloneModulePath.value) { ElMessage.warning('请选择目标模块'); return }
  cloneSubmitting.value = true
  try {
    // 老版克隆语义: 新实例名 = 源名-copy,进程配置照搬源实例
    const instances = [{
      bk_host_id: cloneSource.value.bk_host_id,
      service_instance_name: `${cloneSource.value.name || '实例'}-copy`,
      processes: cloneProcesses.value.map((proc) => ({ process_info: proc.property || {} }))
    }]
    await createServiceInstance(bizId.value, cloneModulePath.value, instances)
    ElMessage.success('克隆成功')
    cloneVisible.value = false
    loadInstances()
  } catch (e) {
    ElMessage.error('克隆失败: ' + (e?.message || '后端异常'))
  } finally { cloneSubmitting.value = false }
}

// ---------- 批量编辑标签(老版 label-batch-dialog 语义) ----------
const labelVisible = ref(false)
const labelRows = ref([{ key: '', value: '' }])
const labelSaving = ref(false)

async function submitLabels() {
  const labelSet = {}
  for (const r of labelRows.value) {
    if (r.key.trim()) labelSet[r.key.trim()] = r.value.trim()
  }
  if (!Object.keys(labelSet).length) { ElMessage.warning('请至少填写一个标签'); return }
  labelSaving.value = true
  try {
    await createInstanceLabels({
      bk_biz_id: bizId.value,
      instance_ids: selectedInstances.value.map((i) => i.id),
      labels: labelSet
    })
    ElMessage.success('标签已应用')
    labelVisible.value = false
    loadInstances()
  } catch (e) {
    ElMessage.error('保存失败: ' + (e?.message || '后端异常'))
  } finally { labelSaving.value = false }
}

async function removeInstance(row) {
  await ElMessageBox.confirm(`确定删除服务实例「${row.name || row.id}」?`, '删除确认', { type: 'warning' })
  await deleteServiceInstances(bizId.value, [row.id])
  ElMessage.success('已删除')
  loadInstances()
}

function onGlobalClick() {
  if (ctxMenu.value.visible) ctxMenu.value.visible = false
}
watch(bizId, () => { if (bizId.value) { load(); loadModuleOptions() } })
watch([rightTab, currentNode], () => {
  if (rightTab.value === 'node' && currentNode.value?.type === 'biz' && bizInfoLoadedFor !== bizId.value) {
    bizInfoLoadedFor = bizId.value
    loadBizNodeInfo()
  }
}, { immediate: true })

onMounted(async () => {
  document.addEventListener('click', onGlobalClick)
  await bizStore.ensureLoaded()
  loadPickedColumns()
  if (bizId.value) {
    const fromQuery = Number(route.query.biz || route.params.bizId)
    if (fromQuery && bizStore.bizList.some((b) => b.bk_biz_id === fromQuery)) bizStore.select(fromQuery)
    load()
    loadModuleOptions()
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onGlobalClick)
})
</script>

<style scoped>
.topo-page { height: 100%; display: flex; flex-direction: column; background: #fff; }
.page-title {
  font-size: 16px; color: #313238; font-weight: 400;
  padding: 0 20px; height: 50px; line-height: 50px;
  border-bottom: 1px solid #E7E9EF; margin: 0;
}
.topo-body { flex: 1; display: flex; overflow: hidden; }
.tree-col {
  width: 286px; flex: 0 0 286px;
  border-right: 1px solid #E7E9EF;
  padding: 12px; overflow: auto;
}
.tree-node { display: flex; align-items: center; gap: 6px; font-size: 12px; flex: 1; }
.node-badge {
  width: 16px; height: 16px; line-height: 16px; text-align: center;
  border-radius: 2px; font-size: 11px; color: #fff; background: #C4C6CC; flex: 0 0 16px;
}
.node-badge.biz { background: #3A84FF; }
.node-badge.set { background: #30d878; }
.node-badge.module { background: #ff9c01; }
.node-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.node-count {
  margin-left: auto;
  min-width: 22px; height: 16px; line-height: 16px;
  padding: 0 6px; text-align: center;
  background: #F0F1F5; border-radius: 8px;
  color: #63656E; font-size: 12px;
}
.node-add { padding: 0 4px; font-size: 16px; line-height: 1; }
.main-col { flex: 1; display: flex; flex-direction: column; overflow: hidden; padding: 0 16px 12px; }
.right-tabs { margin-bottom: 4px; }
.toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.toolbar .spacer { flex: 1; }
.square-btn { padding: 5px 8px; }
.filter-pop .filter-row-label { font-size: 12px; color: #979BA5; margin: 6px 0 4px; }
.refresh-time { color: #979BA5; font-size: 12px; margin: 0 4px; }
.table-footer {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  padding: 10px 0 0; font-size: 12px; color: #63656E;
}
.table-footer .spacer { flex: 1 1 20px; min-width: 0; }
.selected-info { color: #3A84FF; }
.col-set { margin-left: 8px; }
.col-picker-title { font-size: 12px; color: #63656E; margin-bottom: 8px; }
.col-picker-row { padding: 4px 0; }
.col-picker-actions {
  display: flex; justify-content: flex-end; gap: 8px;
  border-top: 1px solid #E7E9EF; padding-top: 8px; margin-top: 8px;
}
.ctx-menu {
  position: fixed; z-index: 9999; min-width: 140px;
  background: #fff; border: 1px solid #E7E9EF; border-radius: 4px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.1); padding: 4px 0;
  list-style: none; margin: 0;
}
.ctx-item {
  padding: 6px 14px; cursor: pointer; font-size: 12px; color: #313238;
}
.ctx-item:hover { background: #F0F5FF; color: #3A84FF; }
.ctx-item.ctx-danger:hover { background: #FFEEEE; color: #EA3636; }
.hint { font-size: 12px; color: #979BA5; padding: 8px 0; }
.proc-row { display: flex; gap: 6px; align-items: center; margin-bottom: 4px; }
.label-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.label-eq { color: #979BA5; }
</style>