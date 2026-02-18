using System.Collections.Generic;
using PisoNet.Core.Models;

namespace PisoNet.Core.Interfaces
{
    public interface ITransactionRepository
    {
        void AddTransaction(Transaction transaction);
        decimal GetTotalRevenue();
        decimal GetUnitRevenue(int unitId);
    }
}
