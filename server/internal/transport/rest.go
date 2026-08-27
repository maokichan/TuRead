package transport

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"turead/server/internal/domain"
)

// ---------- REST：健康检查 ----------

// GET /healthz —— 存活探针：DB 可 ping 则 200 ok，否则 503 degraded
func (s *Server) handleHealthz(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	if err := s.store.Ping(ctx); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "degraded", "error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// ---------- REST：创建房间 ----------

type createRoomRequest struct {
	Owner string   `json:"owner"`
	Book  bookInfo `json:"book"`
}

type bookInfo struct {
	Protocol string `json:"protocol"`
	Code     string `json:"code"`
	Title    string `json:"title"`
	Author   string `json:"author"`
	Ext      string `json:"ext"`
	HashAlgo string `json:"hashAlgo,omitempty"`
	Hash     string `json:"hash"`
	Size     int64  `json:"size"`
	Source   string `json:"source,omitempty"`
	URL      string `json:"url,omitempty"` // 可选：下载来源（外部平台 zlib/anna 等，或本机地址）；本机副本状态由上传动作决定
}

type createRoomResponse struct {
	RoomID    string `json:"roomId"`
	EditionID int64  `json:"editionId"`
	WorkID    int64  `json:"workId"`
	Created   bool   `json:"created"`
}

func (s *Server) handleCreateRoom(w http.ResponseWriter, r *http.Request) {
	var req createRoomRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, http.StatusBadRequest, "bad request: "+err.Error())
		return
	}
	if req.Owner == "" || !domain.ValidProtocol(req.Book.Protocol) {
		writeErr(w, http.StatusBadRequest, "owner and valid protocol required")
		return
	}
	code, ok := domain.NormalizeCode(req.Book.Protocol, req.Book.Code)
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid "+req.Book.Protocol+" code")
		return
	}
	if req.Book.Title == "" || req.Book.Ext == "" || req.Book.Hash == "" || req.Book.Size <= 0 {
		writeErr(w, http.StatusBadRequest, "title, ext, hash, size required")
		return
	}
	algo := req.Book.HashAlgo
	if algo == "" {
		algo = "md5-sample3-v1"
	}

	workID, _, err := s.store.RegisterWork(domain.Work{
		Title:    req.Book.Title,
		Protocol: req.Book.Protocol,
		Code:     code,
		Author:   req.Book.Author,
	})
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	ed := domain.Edition{
		WorkID:   workID,
		Ext:      strings.ToLower(req.Book.Ext),
		HashAlgo: algo,
		Hash:     req.Book.Hash,
		Size:     req.Book.Size,
		Source:   req.Book.Source,
		URL:      req.Book.URL,
	}
	ed.FilePath = s.files.RelPath(ed)
	editionID, _, err := s.store.RegisterEdition(ed)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}

	r2, err := s.rooms.Create(editionID, req.Owner)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, createRoomResponse{
		RoomID:    r2.ID,
		EditionID: editionID,
		WorkID:    workID,
		Created:   true,
	})
}

// ---------- REST：电子版信息 / 上传 / 下载 ----------

func (s *Server) getEdition(w http.ResponseWriter, r *http.Request) (*domain.Edition, bool) {
	id, err := strconv.ParseInt(r.PathValue("editionID"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid edition id")
		return nil, false
	}
	ed, err := s.store.GetEdition(id)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return nil, false
	}
	if ed == nil {
		writeErr(w, http.StatusNotFound, "edition not found")
		return nil, false
	}
	return ed, true
}

func (s *Server) handleGetEdition(w http.ResponseWriter, r *http.Request) {
	ed, ok := s.getEdition(w, r)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, ed)
}

// 上传文件副本（内容寻址存储；已存在则幂等跳过；成功后标记本机已有副本 local_copy=1）
func (s *Server) handleUploadFile(w http.ResponseWriter, r *http.Request) {
	ed, ok := s.getEdition(w, r)
	if !ok {
		return
	}
	_, err := s.files.Save(*ed, r.Body)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := s.store.MarkLocalCopy(ed.ID); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusOK)
}

// 下载文件副本（分发：让无书成员获得电子版）
func (s *Server) handleDownloadFile(w http.ResponseWriter, r *http.Request) {
	ed, ok := s.getEdition(w, r)
	if !ok {
		return
	}
	f, err := s.files.Open(*ed)
	if err != nil {
		writeErr(w, http.StatusNotFound, "file not uploaded yet")
		return
	}
	defer f.Close()
	w.Header().Set("Content-Disposition", "attachment; filename=\"book."+ed.Ext+"\"")
	http.ServeContent(w, r, "book."+ed.Ext, ed.CreatedAt, f)
}
