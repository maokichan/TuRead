package store

import (
	"fmt"
	"io"
	"os"
	"path/filepath"

	"turead/server/internal/domain"
)

// FileStore 内容寻址文件存储：<dataDir>/books/<hash>.<ext>
// 文件名即指纹，同一电子版被多个房间/成员共享时天然去重
type FileStore struct {
	booksDir string
}

func NewFileStore(dataDir string) (*FileStore, error) {
	booksDir := filepath.Join(dataDir, "books")
	if err := os.MkdirAll(booksDir, 0o755); err != nil {
		return nil, fmt.Errorf("create books dir: %w", err)
	}
	return &FileStore{booksDir: booksDir}, nil
}

// Path 返回电子版在磁盘的绝对路径
func (f *FileStore) Path(e domain.Edition) string {
	return filepath.Join(f.booksDir, e.Hash+"."+e.Ext)
}

// RelPath 返回相对路径（dataDir 之外的人看，如客户端下载标识）
func (f *FileStore) RelPath(e domain.Edition) string {
	return filepath.Join("books", e.Hash+"."+e.Ext)
}

func (f *FileStore) Exists(e domain.Edition) bool {
	_, err := os.Stat(f.Path(e))
	return err == nil
}

// Save 保存文件副本：已存在则跳过；否则写临时文件再 rename，防半写
func (f *FileStore) Save(e domain.Edition, r io.Reader) (bool, error) {
	final := f.Path(e)
	if _, err := os.Stat(final); err == nil {
		return false, nil
	}
	tmp, err := os.CreateTemp(f.booksDir, "upload-*")
	if err != nil {
		return false, fmt.Errorf("create temp: %w", err)
	}
	tmpPath := tmp.Name()
	if _, err := io.Copy(tmp, r); err != nil {
		tmp.Close()
		os.Remove(tmpPath)
		return false, fmt.Errorf("write temp: %w", err)
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpPath)
		return false, fmt.Errorf("close temp: %w", err)
	}
	if err := os.Rename(tmpPath, final); err != nil {
		os.Remove(tmpPath)
		return false, fmt.Errorf("rename: %w", err)
	}
	return true, nil
}

// Open 打开电子版文件供下载
func (f *FileStore) Open(e domain.Edition) (*os.File, error) {
	return os.Open(f.Path(e))
}
