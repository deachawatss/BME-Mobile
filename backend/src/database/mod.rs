use anyhow::{Context, Result};
use std::collections::HashMap;
use std::env;
use tiberius::{AuthMethod, Client, Config, EncryptionLevel, Query, Row};
use tokio::net::TcpStream;
use tokio_util::compat::TokioAsyncWriteCompatExt;
use tracing::info;

pub mod bulk_runs;
pub mod bulk_runs_intelligence;
pub mod putaway;
pub mod putaway_db;
pub mod replication;

// Default warehouse location key for bulk operations
pub const DEFAULT_LOCATION_KEY: &str = "TFC1";

/// Unified database configuration supporting flexible database switching
#[derive(Clone, Debug)]
pub struct DatabaseConfig {
    pub server: String,
    pub database: String,
    pub username: String,
    pub password: String,
    pub port: u16,
}

/// Centralized database management with flexible primary/replica switching
#[derive(Clone)]
pub struct Database {
    /// Primary database configuration (read/write operations)
    primary_config: DatabaseConfig,
    /// Replica database configuration (optional, for replication)
    replica_config: Option<DatabaseConfig>,
    /// Database name mappings for easy access
    database_configs: HashMap<String, DatabaseConfig>,
}

impl std::fmt::Debug for Database {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Database")
            .field("primary_database", &self.primary_config.database)
            .field("replica_database", &self.replica_config.as_ref().map(|c| &c.database))
            .field("available_databases", &self.database_configs.keys().collect::<Vec<_>>())
            .finish()
    }
}

impl Database {
    /// Initialize database with flexible configuration from environment
    pub fn new() -> Result<Self> {
        let primary_db = env::var("PRIMARY_DB").unwrap_or_else(|_| "TFCPILOT3".to_string());
        let replica_db = env::var("REPLICA_DB").unwrap_or_default();
        
        info!("🔄 Initializing database with PRIMARY_DB={}, REPLICA_DB={}", primary_db, replica_db);

        // Load database configurations dynamically based on PRIMARY_DB and REPLICA_DB
        let mut database_configs = HashMap::new();
        
        // Collect unique database names from PRIMARY_DB and REPLICA_DB
        let mut database_names = std::collections::HashSet::new();
        database_names.insert(primary_db.as_str());
        if !replica_db.is_empty() {
            database_names.insert(replica_db.as_str());
        }
        
        // Load only the databases that are actually configured
        for db_name in database_names {
            if let Ok(config) = Self::load_database_config(db_name) {
                database_configs.insert(db_name.to_string(), config);
                info!("✅ Loaded configuration for database: {}", db_name);
            } else {
                return Err(anyhow::anyhow!(
                    "Required database '{}' configuration not found. Please set {}_SERVER, {}_DATABASE, {}_USERNAME, {}_PASSWORD environment variables", 
                    db_name, db_name, db_name, db_name, db_name
                ));
            }
        }

        // Set primary configuration
        let primary_config = database_configs
            .get(&primary_db)
            .ok_or_else(|| anyhow::anyhow!("Primary database '{}' configuration not found", primary_db))?
            .clone();

        // Set replica configuration (optional)
        let replica_config = if !replica_db.is_empty() {
            database_configs.get(&replica_db).cloned()
        } else {
            None
        };

        info!("🎯 Database initialized - Primary: {}, Replica: {:?}", 
              primary_config.database, 
              replica_config.as_ref().map(|c| &c.database));

        Ok(Self {
            primary_config,
            replica_config,
            database_configs,
        })
    }

    /// Load database configuration for a specific database name
    fn load_database_config(db_name: &str) -> Result<DatabaseConfig> {
        let server_key = format!("{}_SERVER", db_name);
        let port_key = format!("{}_PORT", db_name);
        let database_key = format!("{}_DATABASE", db_name);
        let username_key = format!("{}_USERNAME", db_name);
        let password_key = format!("{}_PASSWORD", db_name);

        let server = env::var(&server_key)
            .with_context(|| format!("Missing environment variable: {}", server_key))?;
        let database = env::var(&database_key)
            .with_context(|| format!("Missing environment variable: {}", database_key))?;
        let username = env::var(&username_key)
            .with_context(|| format!("Missing environment variable: {}", username_key))?;
        let password = env::var(&password_key)
            .with_context(|| format!("Missing environment variable: {}", password_key))?;
        let port = env::var(&port_key)
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

    /// Get database client connection - UNIFIED METHOD (replaces all variants)
    pub async fn get_client(&self) -> Result<Client<tokio_util::compat::Compat<TcpStream>>> {
        self.get_primary_client().await
    }

    /// Get primary database client (read/write operations)
    pub async fn get_primary_client(&self) -> Result<Client<tokio_util::compat::Compat<TcpStream>>> {
        Self::create_client(&self.primary_config).await
            .with_context(|| format!("Failed to connect to primary database: {}", self.primary_config.database))
    }

    /// Get replica database client (optional, for replication)
    pub async fn get_replica_client(&self) -> Result<Option<Client<tokio_util::compat::Compat<TcpStream>>>> {
        if let Some(ref replica_config) = self.replica_config {
            Ok(Some(Self::create_client(replica_config).await
                .with_context(|| format!("Failed to connect to replica database: {}", replica_config.database))?))
        } else {
            Ok(None)
        }
    }

    /// Get specific database client by name (for special operations)
    pub async fn get_database_client(&self, db_name: &str) -> Result<Client<tokio_util::compat::Compat<TcpStream>>> {
        let config = self.database_configs
            .get(db_name)
            .ok_or_else(|| anyhow::anyhow!("Database '{}' not configured", db_name))?;
        
        Self::create_client(config).await
            .with_context(|| format!("Failed to connect to database: {}", db_name))
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

    /// Get primary database name
    pub fn get_primary_database_name(&self) -> &str {
        &self.primary_config.database
    }

    /// Get replica database name (if configured)
    pub fn get_replica_database_name(&self) -> Option<&str> {
        self.replica_config.as_ref().map(|c| c.database.as_str())
    }

    /// Check if replication is enabled
    pub fn has_replica(&self) -> bool {
        self.replica_config.is_some()
    }

    /// List available database configurations
    pub fn get_available_databases(&self) -> Vec<&str> {
        self.database_configs.keys().map(|s| s.as_str()).collect()
    }

    /// Check if a table exists in the primary database
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

// LEGACY METHODS REMOVED - All replaced by unified get_client() method
// - get_client() -> use get_client()
// - get_client() -> use get_client() 
// - get_primary_client() -> use get_database_client("TFCPILOT3")
// - get_replica_client() -> use get_database_client("TFCMOBILE")