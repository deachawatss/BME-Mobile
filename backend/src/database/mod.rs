use anyhow::{Context, Result};
use bb8::Pool;
use bb8_tiberius::ConnectionManager;
use std::env;
use std::time::Duration;
use tiberius::{AuthMethod, Config, EncryptionLevel, Query, Row};
use tracing::info;

pub mod bulk_runs;
pub mod bulk_runs_intelligence;
pub mod putaway;
pub mod putaway_db;

// Default warehouse location key for bulk operations
pub const DEFAULT_LOCATION_KEY: &str = "TFC1";

/// Database configuration with connection pooling
#[derive(Clone, Debug)]
pub struct DatabaseConfig {
    pub server: String,
    pub database: String,
    pub username: String,
    pub password: String,
    pub port: u16,
}

/// Database management with connection pooling for high performance
#[derive(Clone)]
pub struct Database {
    /// Connection pool for all database operations
    pool: Pool<ConnectionManager>,
    /// Database configuration
    config: DatabaseConfig,
    /// Maximum pool size
    max_pool_size: u32,
}

impl std::fmt::Debug for Database {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Database")
            .field("database", &self.config.database)
            .field("server", &self.config.server)
            .field("pool_size", &"configured")
            .finish()
    }
}

impl Database {
    /// Initialize database with connection pooling
    pub async fn new() -> Result<Self> {
        info!("🔄 Initializing database with connection pooling");

        let config = Self::load_database_config()?;
        let max_pool_size = 20u32;
        let pool = Self::create_pool(&config).await?;

        info!(
            "✅ Connection pool initialized - Database: {}, Max connections: {}, Min idle: 5",
            config.database, max_pool_size
        );

        Ok(Self { pool, config, max_pool_size })
    }

    /// Load database configuration from environment variables
    fn load_database_config() -> Result<DatabaseConfig> {
        let server = env::var("DATABASE_SERVER")
            .with_context(|| "Missing environment variable: DATABASE_SERVER")?;
        let database = env::var("DATABASE_NAME")
            .with_context(|| "Missing environment variable: DATABASE_NAME")?;
        let username = env::var("DATABASE_USERNAME")
            .with_context(|| "Missing environment variable: DATABASE_USERNAME")?;
        let password = env::var("DATABASE_PASSWORD")
            .with_context(|| "Missing environment variable: DATABASE_PASSWORD")?;
        let port = env::var("DATABASE_PORT")
            .unwrap_or_else(|_| "49381".to_string())
            .parse()
            .unwrap_or(49381);

        Ok(DatabaseConfig {
            server,
            database,
            username,
            password,
            port,
        })
    }

    /// Create connection pool
    async fn create_pool(config: &DatabaseConfig) -> Result<Pool<ConnectionManager>> {
        let mut tiberius_config = Config::new();
        tiberius_config.host(&config.server);
        tiberius_config.port(config.port);
        tiberius_config.database(&config.database);
        tiberius_config.authentication(AuthMethod::sql_server(&config.username, &config.password));
        tiberius_config.encryption(EncryptionLevel::NotSupported);
        tiberius_config.trust_cert();

        let manager = ConnectionManager::new(tiberius_config);

        // Configure connection pool settings
        let pool = Pool::builder()
            .max_size(20)  // Max 20 connections (adjust based on SQL Server limits)
            .min_idle(Some(5))  // Keep 5 connections warm
            .connection_timeout(Duration::from_secs(10))  // Wait max 10s for connection
            .idle_timeout(Some(Duration::from_secs(300)))  // Close idle connections after 5 minutes
            .max_lifetime(Some(Duration::from_secs(1800)))  // Recycle connections after 30 minutes
            .build(manager)
            .await
            .context("Failed to create connection pool")?;

        // Test pool connectivity with one connection
        let test_conn = pool.get().await
            .context("Failed to get test connection from pool")?;

        info!("✅ Connection pool test successful");
        drop(test_conn);

        Ok(pool)
    }

    /// Get pooled database client connection (reuses existing connections)
    pub async fn get_client(&self) -> Result<bb8::PooledConnection<'_, ConnectionManager>> {
        self.pool.get().await
            .with_context(|| format!("Failed to get connection from pool for database: {}", self.config.database))
    }

    /// Get database name
    pub fn get_database_name(&self) -> &str {
        &self.config.database
    }

    /// Check if a table exists in the database
    pub async fn table_exists(&self, table_name: &str) -> Result<bool> {
        let mut client = self.get_client().await?;

        let query = r#"
            SELECT COUNT(*) as table_count
            FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_NAME = @P1 AND TABLE_TYPE = 'BASE TABLE'
        "#;

        let mut query_builder = Query::new(query);
        query_builder.bind(table_name);

        let stream = query_builder.query(&mut *client).await?;
        let rows: Vec<Vec<Row>> = stream.into_results().await?;

        if let Some(row) = rows.first().and_then(|r| r.first()) {
            let count: i32 = row.get("table_count").unwrap_or(0);
            Ok(count > 0)
        } else {
            Ok(false)
        }
    }

    /// Get connection pool statistics for monitoring
    pub fn get_pool_status(&self) -> PoolStatus {
        PoolStatus {
            total_connections: self.pool.state().connections,
            idle_connections: self.pool.state().idle_connections,
            max_size: self.max_pool_size,
        }
    }
}

/// Connection pool status for monitoring
#[derive(Debug, Clone, serde::Serialize)]
pub struct PoolStatus {
    pub total_connections: u32,
    pub idle_connections: u32,
    pub max_size: u32,
}

