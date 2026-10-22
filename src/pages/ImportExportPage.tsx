import { Button, Card, Space, Upload, message } from "antd";
import { api } from "../api";
import { CAP_HINTS, hasCap, useAuth } from "../auth";
import CapAction from "../components/CapAction";

/**
 * 知识库导入导出。本期导出 JSON/CSV，导入 JSON。
 */
export default function ImportExportPage() {
  const { user } = useAuth();
  const canDownload = hasCap(user, "pack_download");

  const download = async (fmt: string) => {
    const res = await api.get("/api/export", { params: { fmt }, responseType: "blob" });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = fmt === "csv" || fmt === "xlsx" ? "knowledge.csv" : "knowledge.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card title="导入导出">
      <Space direction="vertical" size={16}>
        <div>
          <CapAction allowed={canDownload} hint={CAP_HINTS.pack_download}>
            <Button type="primary" onClick={() => download("json")} style={{ marginRight: 8 }}>
              导出 JSON
            </Button>
          </CapAction>
          <CapAction allowed={canDownload} hint={CAP_HINTS.pack_download}>
            <Button onClick={() => download("csv")}>导出 CSV</Button>
          </CapAction>
        </div>
        <Upload
          showUploadList={false}
          accept=".json"
          customRequest={async ({ file, onSuccess, onError }) => {
            try {
              const text = await (file as File).text();
              const payload = JSON.parse(text);
              const res = await api.post("/api/import", Array.isArray(payload) ? { items: payload } : payload);
              message.success(`导入完成：新增 ${res.data.created}，更新 ${res.data.updated}`);
              onSuccess && onSuccess({}, new XMLHttpRequest());
            } catch (e) {
              message.error("导入失败，本期请使用 JSON");
              onError && onError(e as Error);
            }
          }}
        >
          <Button>导入 JSON</Button>
        </Upload>
        <div style={{ color: "#667" }}>
          JSON / CSV 用于实例往返校对。给大模型准备的完整结构化知识包请到「知识总表」预览和导出。
        </div>
      </Space>
    </Card>
  );
}
