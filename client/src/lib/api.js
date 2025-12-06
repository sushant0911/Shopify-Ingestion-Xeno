const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

/**
 * Fetch stats (total customers, orders, revenue)
 */
export async function fetchStats(tenantId) {
  const response = await fetch(`${API_BASE_URL}/analytics/stats?tenantId=${tenantId}`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch stats: ${response.statusText}`);
  }
  
  const data = await response.json();
  return data.data;
}

/**
 * Fetch sales over time data
 */
export async function fetchSalesOverTime(tenantId) {
  const response = await fetch(`${API_BASE_URL}/analytics/sales-over-time?tenantId=${tenantId}`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch sales over time: ${response.statusText}`);
  }
  
  const data = await response.json();
  return data.data;
}

/**
 * Fetch top customers
 */
export async function fetchTopCustomers(tenantId) {
  const response = await fetch(`${API_BASE_URL}/analytics/top-customers?tenantId=${tenantId}`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch top customers: ${response.statusText}`);
  }
  
  const data = await response.json();
  return data.data;
}

