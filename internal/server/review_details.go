package server

import (
	"net/http"
	"strconv"
)

func (s *Server) handleApprovalDetail(w http.ResponseWriter, r *http.Request, path string, tenantID int64, platform bool) {
	parts := splitPath(path)
	if len(parts) != 2 || (parts[0] != "short_link" && parts[0] != "live_qr" && parts[0] != "live_qr_item") {
		writeJSON(w, http.StatusBadRequest, apiErr("bad_path", "审批资源路径不正确"))
		return
	}
	id, err := strconv.ParseInt(parts[1], 10, 64)
	if err != nil || id <= 0 {
		writeJSON(w, http.StatusBadRequest, apiErr("bad_id", "资源 ID 不正确"))
		return
	}
	detail, err := s.store().GetApprovalDetail(r.Context(), tenantID, parts[0], id, platform)
	if err != nil {
		writeSaaSError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "data": detail})
}
