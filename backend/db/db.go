package db

import (
	"context"
	"log"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
)

// Connect создаёт пул соединений с PostgreSQL.
// Строка подключения берётся из переменной окружения DATABASE_URL
// или из файла backend/.env.
func Connect() *pgxpool.Pool {
	// Загружаем .env, если он есть (не обязателен)
	_ = godotenv.Load()

	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Fatal("DATABASE_URL не задан. Скопируй backend/.env.example в backend/.env и заполни его")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		log.Fatalf("failed to create pool: %v", err)
	}

	if err := pool.Ping(ctx); err != nil {
		log.Fatalf("failed to connect to database: %v", err)
	}

	log.Println("Connected to PostgreSQL")
	return pool
}

// Migrate создаёт таблицы, если их ещё нет.
func Migrate(pool *pgxpool.Pool) error {
	_, err := pool.Exec(context.Background(), `
		CREATE TABLE IF NOT EXISTS scans (
			id          BIGSERIAL PRIMARY KEY,
			tag_id      TEXT NOT NULL,
			scanned_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
			device_id   TEXT NOT NULL DEFAULT 'unknown',
			synced      BOOLEAN NOT NULL DEFAULT false
		);

		CREATE INDEX IF NOT EXISTS idx_scans_tag_id ON scans (tag_id);
		CREATE INDEX IF NOT EXISTS idx_scans_synced ON scans (synced);
	`)
	return err
}
