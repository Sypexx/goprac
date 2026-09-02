package db

import (
	"context"
	"embed"
	"log"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
)

//go:embed schema.sql seed.sql comments.sql
var sqlFS embed.FS

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

// Migrate создаёт таблицы (schema.sql) и наполняет справочники (seed.sql).
// Файлы идемпотентны — повторный запуск безопасен.
func Migrate(pool *pgxpool.Pool) error {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	for _, f := range []string{"schema.sql", "seed.sql", "comments.sql"} {
		sql, err := sqlFS.ReadFile(f)
		if err != nil {
			return err
		}
		if _, err := pool.Exec(ctx, string(sql)); err != nil {
			return err
		}
		log.Printf("Applied %s", f)
	}
	return nil
}
