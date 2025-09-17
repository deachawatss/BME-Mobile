use anyhow::{Context, Result};
use std::env;
use tiberius::{AuthMethod, Client, Config, EncryptionLevel, Query, Row};
use tokio::net::TcpStream;
use tokio_util::compat::TokioAsyncWriteCompatExt;
use tracing::info;

pub mod bulk_runs;
pub mod bulk_runs_intelligence;
pub mod putaway;
pub mod putaway_db;

// Default warehouse location key for bulk operations
pub const DEFAULT_LOCATION_KEY: &str = "TFC1";

/// Simple database configuration for single database setup
#[derive(Clone, Debug)]
pub struct DatabaseConfig {
    pub server: String,
    pub database: String,
    pub username: String,
    pub password: String,
    pub port: u16,
}

/// Simple database management for single database setup
#[derive(Clone)]
pub struct Database {
    /// Database configuration for all operations
    config: DatabaseConfig,
}

impl std::fmt::Debug for Database {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Database")
            .field("database", &self.config.database)
            .field("server", &self.config.server)
            .finish()
    }
}

impl Database {
    /// Initialize database with simple single database configuration
    pub fn new() -> Result<Self> {
        info!("🔄 Initializing single database connection");

        let config = Self::load_database_config()?;

        info!("🎯 Database initialized - {}", config.database);

        Ok(Self { config })
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

    /// Get database client connection
    pub async fn get_client(&self) -> Result<Client<tokio_util::compat::Compat<TcpStream>>> {
        Self::create_client(&self.config).await
            .with_context(|| format!("Failed to connect to database: {}", self.config.database))
    }

    /// Create database client from configuration
    async fn create_client(config: &DatabaseConfig) -> Result<Client<tokio_util::compat::Compat<TcpStream>>> {
        let mut tiberius_config = Config::new();
        tiberius_config.host(&config.server);
        tiberius_config.port(config.port);
        tiberius_config.database(&config.database);
        tiberius_config.authentication(AuthMethod::sql_server(&config.username, &config.password));
        tiberius_config.encryption(EncryptionLevel::NotSupported);
        tiberius_config.trust_cert();

        let tcp = TcpStream::connect((config.server.as_str(), config.port))
            .await
            .with_context(|| format!("Failed to connect to {}:{}", config.server, config.port))?;

        let client = Client::connect(tiberius_config, tcp.compat_write())
            .await
            .with_context(|| format!("Failed to authenticate with database: {}", config.database))?;

        Ok(client)
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

        let stream = query_builder.query(&mut client).await?;
        let rows: Vec<Vec<Row>> = stream.into_results().await?;

        if let Some(row) = rows.first().and_then(|r| r.first()) {
            let count: i32 = row.get("table_count").unwrap_or(0);
            Ok(count > 0)
        } else {
            Ok(false)
        }
    }
}

