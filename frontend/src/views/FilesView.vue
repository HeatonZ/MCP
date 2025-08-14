<template>
  <div class="page">
    <el-row :gutter="16">
      <el-col :span="8">
        <el-card shadow="never">
          <template #header>
            <span>文件</span>
          </template>
          <el-space>
            <el-select v-model="currentDir" style="width: 160px" @change="loadFiles">
              <el-option label="server" value="server" />
              <el-option label="config" value="config" />
            </el-select>
            <el-button @click="loadFiles">刷新</el-button>
          </el-space>
          <el-divider />
          <el-scrollbar height="420px">
            <el-link v-for="f in files" :key="f" :href="'#'" @click.prevent="openFile(f)">{{ f }}</el-link>
          </el-scrollbar>
        </el-card>
      </el-col>

      <el-col :span="16">
        <el-card v-if="openedPath" class="editor" shadow="never">
          <template #header>
            <div class="toolbar">
              <strong>{{ openedPath }}</strong>
              <el-button type="primary" :disabled="!enableCodeEditing" @click="saveFile">保存文件</el-button>
            </div>
          </template>
          <div ref="editorEl" class="monaco"></div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import * as monaco from "monaco-editor";
import { onMounted, ref } from "vue";
import { ElMessage } from "element-plus";

type AppConfig = { features?: { enableCodeEditing?: boolean } };

const files = ref<string[]>([]);
const currentDir = ref<string>("server");
const openedPath = ref<string>("");
const editorEl = ref<HTMLElement | null>(null);
let editor: monaco.editor.IStandaloneCodeEditor | null = null;
const enableCodeEditing = ref(true);

async function loadFeature() {
  const res = await fetch("/api/config");
  const cfg = (await res.json()) as AppConfig;
  enableCodeEditing.value = cfg.features?.enableCodeEditing !== false;
}

async function loadFiles() {
  const res = await fetch(`/api/list?dir=${encodeURIComponent(currentDir.value)}`);
  const json = await res.json();
  files.value = json.files ?? [];
}

async function openFile(path: string) {
  const res = await fetch(`/api/file?path=${encodeURIComponent(path)}`);
  const text = await res.text();
  openedPath.value = path;
  if (!editor && editorEl.value) {
    editor = monaco.editor.create(editorEl.value, {
      value: text,
      language: guessLanguage(path),
      automaticLayout: true,
      theme: "vs-dark",
      fontSize: 14,
      minimap: { enabled: false },
    });
  } else if (editor) {
    const model = editor.getModel();
    if (model) {
      model.setValue(text);
      monaco.editor.setModelLanguage(model, guessLanguage(path));
    }
  }
}

function guessLanguage(path: string) {
  if (path.endsWith(".ts")) return "typescript";
  if (path.endsWith(".json")) return "json";
  if (path.endsWith(".vue")) return "vue";
  if (path.endsWith(".md")) return "markdown";
  return "plaintext";
}

async function saveFile() {
  if (!editor || !openedPath.value) return;
  const content = editor.getValue();
  try {
    const res = await fetch("/api/file", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: openedPath.value, content }),
    });
    if (!res.ok) throw new Error(await res.text());
    ElMessage.success("保存成功");
  } catch (e:any) {
    ElMessage.error("保存失败: " + String(e?.message || e));
  }
}

onMounted(async () => { await loadFeature(); await loadFiles(); });
</script>

<style scoped>
.page{ display:flex; flex-direction:column; gap:16px; padding:16px; }
.editor .toolbar{ display:flex; gap:12px; align-items:center; }
.monaco{ height:500px; border:1px solid #eee; }
</style> 