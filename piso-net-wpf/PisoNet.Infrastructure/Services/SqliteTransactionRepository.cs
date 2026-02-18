using System;
using System.Globalization;
using System.IO;
using Microsoft.Data.Sqlite;
using PisoNet.Core.Interfaces;
using PisoNet.Core.Models;

namespace PisoNet.Infrastructure.Services
{
    public class SqliteTransactionRepository : ITransactionRepository
    {
        private readonly string _connectionString;

        public SqliteTransactionRepository()
        {
            var appData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            var dataDir = Path.Combine(appData, "PisoNet");
            Directory.CreateDirectory(dataDir);

            var dbPath = Path.Combine(dataDir, "pisonet.db");
            _connectionString = $"Data Source={dbPath}";

            InitializeDatabase();
        }

        private void InitializeDatabase()
        {
            using var connection = new SqliteConnection(_connectionString);
            connection.Open();

            using var command = connection.CreateCommand();
            command.CommandText = @"
                CREATE TABLE IF NOT EXISTS transactions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    unit_id INTEGER NOT NULL,
                    amount REAL NOT NULL,
                    timestamp TEXT NOT NULL
                );";
            command.ExecuteNonQuery();
        }

        public void AddTransaction(Transaction transaction)
        {
            using var connection = new SqliteConnection(_connectionString);
            connection.Open();

            using var command = connection.CreateCommand();
            command.CommandText = @"
                INSERT INTO transactions (unit_id, amount, timestamp)
                VALUES ($unitId, $amount, $timestamp);";
            command.Parameters.AddWithValue("$unitId", transaction.UnitId);
            command.Parameters.AddWithValue("$amount", transaction.Amount);
            command.Parameters.AddWithValue("$timestamp", transaction.Timestamp.ToString("o"));
            command.ExecuteNonQuery();
        }

        public decimal GetTotalRevenue()
        {
            using var connection = new SqliteConnection(_connectionString);
            connection.Open();

            using var command = connection.CreateCommand();
            command.CommandText = "SELECT COALESCE(SUM(amount), 0) FROM transactions;";
            var result = command.ExecuteScalar();
            return Convert.ToDecimal(result, CultureInfo.InvariantCulture);
        }

        public decimal GetUnitRevenue(int unitId)
        {
            using var connection = new SqliteConnection(_connectionString);
            connection.Open();

            using var command = connection.CreateCommand();
            command.CommandText = "SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE unit_id = $unitId;";
            command.Parameters.AddWithValue("$unitId", unitId);
            var result = command.ExecuteScalar();
            return Convert.ToDecimal(result, CultureInfo.InvariantCulture);
        }
    }
}
