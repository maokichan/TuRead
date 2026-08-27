package main

import (
	"log"
	"net/http"
	"os"
	"path/filepath"

	"turead/server/internal/room"
	"turead/server/internal/store"
	"turead/server/internal/transport"
)

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

const version = "0.1.0"

func main() {
	dataDir, err := filepath.Abs(getenv("TUREAD_DATA_DIR", "data"))
	if err != nil {
		log.Fatal(err)
	}
	addr := getenv("TUREAD_ADDR", ":8080")
	maxMembers := 20

	st, err := store.Open(dataDir)
	if err != nil {
		log.Fatalf("open store: %v", err)
	}
	defer st.Close()

	fs, err := store.NewFileStore(dataDir)
	if err != nil {
		log.Fatalf("open file store: %v", err)
	}

	rm := room.NewManager(maxMembers)
	srv := transport.NewServer(st, fs, rm)

	log.Printf("TuRead server %s listening on %s (data: %s)", version, addr, dataDir)
	if err := http.ListenAndServe(addr, srv.Routes()); err != nil {
		log.Fatal(err)
	}
}
