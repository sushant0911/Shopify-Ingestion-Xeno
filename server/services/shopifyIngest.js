const axios = require('axios');
const { PrismaClient } = require('@prisma/client');

// PrismaClient automatically reads DATABASE_URL from environment
const prisma = new PrismaClient();

// Shopify API configuration
const API_VERSION = '2023-10';
const REQUESTS_PER_SECOND = 2; // Shopify REST API limit
const MIN_DELAY_MS = 1000 / REQUESTS_PER_SECOND; // 500ms between requests

/**
 * Rate limiter to handle Shopify API rate limits
 */
class RateLimiter {
  constructor() {
    this.lastRequestTime = 0;
    this.queue = [];
    this.processing = false;
  }

  async wait() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < MIN_DELAY_MS) {
      const waitTime = MIN_DELAY_MS - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
  }

  async execute(fn) {
    await this.wait();
    return fn();
  }
}

const rateLimiter = new RateLimiter();

/**
 * Make a request to Shopify API with rate limiting and retry logic
 */
async function shopifyRequest(accessToken, shopDomain, endpoint, params = {}) {
  const url = `https://${shopDomain}.myshopify.com/admin/api/${API_VERSION}/${endpoint}.json`;
  
  const makeRequest = async () => {
    try {
      const response = await axios.get(url, {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
        params,
      });
      return response;
    } catch (error) {
      // Handle rate limit (429) or server errors (5xx)
      if (error.response) {
        const status = error.response.status;
        const retryAfter = error.response.headers['retry-after'];
        
        if (status === 429) {
          // Rate limited - wait and retry
          const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 2000;
          console.log(`Rate limited. Waiting ${waitTime}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          return makeRequest(); // Retry
        }
        
        if (status >= 500) {
          // Server error - retry after delay
          console.log(`Server error ${status}. Retrying...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
          return makeRequest(); // Retry
        }
      }
      
      throw error;
    }
  };

  return rateLimiter.execute(makeRequest);
}

/**
 * Fetch all products from Shopify with pagination
 */
async function fetchAllProducts(accessToken, shopDomain) {
  const allProducts = [];
  let pageInfo = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const params = pageInfo ? { page_info: pageInfo, limit: 250 } : { limit: 250 };
    const response = await shopifyRequest(accessToken, shopDomain, 'products', params);
    
    const products = response.data.products || [];
    allProducts.push(...products);

    // Check for next page using Link header
    const linkHeader = response.headers.link;
    if (linkHeader && linkHeader.includes('rel="next"')) {
      const nextMatch = linkHeader.match(/<[^>]*page_info=([^>]+)>; rel="next"/);
      pageInfo = nextMatch ? nextMatch[1] : null;
      hasNextPage = !!pageInfo;
    } else {
      hasNextPage = false;
    }

    console.log(`Fetched ${products.length} products (Total: ${allProducts.length})`);
  }

  return allProducts;
}

/**
 * Fetch all customers from Shopify with pagination
 */
async function fetchAllCustomers(accessToken, shopDomain) {
  const allCustomers = [];
  let pageInfo = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const params = pageInfo ? { page_info: pageInfo, limit: 250 } : { limit: 250 };
    const response = await shopifyRequest(accessToken, shopDomain, 'customers', params);
    
    const customers = response.data.customers || [];
    allCustomers.push(...customers);

    // Check for next page using Link header
    const linkHeader = response.headers.link;
    if (linkHeader && linkHeader.includes('rel="next"')) {
      const nextMatch = linkHeader.match(/<[^>]*page_info=([^>]+)>; rel="next"/);
      pageInfo = nextMatch ? nextMatch[1] : null;
      hasNextPage = !!pageInfo;
    } else {
      hasNextPage = false;
    }

    console.log(`Fetched ${customers.length} customers (Total: ${allCustomers.length})`);
  }

  return allCustomers;
}

/**
 * Fetch all orders from Shopify with pagination
 */
async function fetchAllOrders(accessToken, shopDomain) {
  const allOrders = [];
  let pageInfo = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const params = pageInfo ? { page_info: pageInfo, limit: 250 } : { limit: 250 };
    const response = await shopifyRequest(accessToken, shopDomain, 'orders', params);
    
    const orders = response.data.orders || [];
    allOrders.push(...orders);

    // Check for next page using Link header
    const linkHeader = response.headers.link;
    if (linkHeader && linkHeader.includes('rel="next"')) {
      const nextMatch = linkHeader.match(/<[^>]*page_info=([^>]+)>; rel="next"/);
      pageInfo = nextMatch ? nextMatch[1] : null;
      hasNextPage = !!pageInfo;
    } else {
      hasNextPage = false;
    }

    console.log(`Fetched ${orders.length} orders (Total: ${allOrders.length})`);
  }

  return allOrders;
}

/**
 * Sync products to database
 */
async function syncProducts(products, tenantId) {
  let synced = 0;
  
  for (const product of products) {
    // Get the first variant's price (or handle multiple variants as needed)
    const price = product.variants && product.variants.length > 0 
      ? parseFloat(product.variants[0].price) 
      : 0;

    await prisma.product.upsert({
      where: {
        shopifyProductId: product.id.toString(),
      },
      update: {
        title: product.title,
        price: price,
        updatedAt: new Date(),
      },
      create: {
        shopifyProductId: product.id.toString(),
        title: product.title,
        price: price,
        tenantId: tenantId,
      },
    });
    
    synced++;
  }

  console.log(`Synced ${synced} products to database`);
  return synced;
}

/**
 * Sync customers to database
 */
async function syncCustomers(customers, tenantId) {
  let synced = 0;
  
  for (const customer of customers) {
    await prisma.customer.upsert({
      where: {
        shopifyCustomerId: customer.id.toString(),
      },
      update: {
        firstName: customer.first_name || null,
        lastName: customer.last_name || null,
        email: customer.email || '',
        updatedAt: new Date(),
      },
      create: {
        shopifyCustomerId: customer.id.toString(),
        firstName: customer.first_name || null,
        lastName: customer.last_name || null,
        email: customer.email || '',
        totalSpend: 0, // Will be updated when orders are synced
        tenantId: tenantId,
      },
    });
    
    synced++;
  }

  console.log(`Synced ${synced} customers to database`);
  return synced;
}

/**
 * Sync orders to database
 * Note: Orders need to be linked to customers, so customers must be synced first
 */
async function syncOrders(orders, tenantId) {
  let synced = 0;
  let skipped = 0;
  
  for (const order of orders) {
    // Skip orders without a customer (guest checkout)
    if (!order.customer || !order.customer.id) {
      skipped++;
      continue;
    }

    // Find the customer in our database
    const customer = await prisma.customer.findUnique({
      where: {
        shopifyCustomerId: order.customer.id.toString(),
      },
    });

    if (!customer) {
      console.warn(`Customer ${order.customer.id} not found for order ${order.id}. Skipping order.`);
      skipped++;
      continue;
    }

    const totalPrice = parseFloat(order.total_price || 0);
    const createdAt = new Date(order.created_at);

    await prisma.order.upsert({
      where: {
        shopifyOrderId: order.id.toString(),
      },
      update: {
        totalPrice: totalPrice,
        createdAt: createdAt,
        updatedAt: new Date(),
      },
      create: {
        shopifyOrderId: order.id.toString(),
        totalPrice: totalPrice,
        createdAt: createdAt,
        customerId: customer.id,
        tenantId: tenantId,
      },
    });
    
    synced++;
  }

  // Update customer totalSpend based on their orders
  await updateCustomerTotalSpend(tenantId);

  console.log(`Synced ${synced} orders to database (${skipped} skipped)`);
  return synced;
}

/**
 * Update totalSpend for all customers based on their orders
 */
async function updateCustomerTotalSpend(tenantId) {
  const customers = await prisma.customer.findMany({
    where: { tenantId },
    include: {
      orders: {
        select: {
          totalPrice: true,
        },
      },
    },
  });

  for (const customer of customers) {
    const totalSpend = customer.orders.reduce(
      (sum, order) => sum + parseFloat(order.totalPrice),
      0
    );

    await prisma.customer.update({
      where: { id: customer.id },
      data: { totalSpend: totalSpend },
    });
  }

  console.log(`Updated totalSpend for ${customers.length} customers`);
}

/**
 * Main function to sync all store data from Shopify
 * @param {string} tenantId - The tenant ID in the database
 * @param {string} accessToken - Shopify access token
 * @param {string} shopDomain - Shopify shop domain (e.g., 'mystore' for mystore.myshopify.com)
 */
async function syncStoreData(tenantId, accessToken, shopDomain) {
  try {
    console.log(`Starting sync for tenant ${tenantId} (${shopDomain})...`);

    // Verify tenant exists
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new Error(`Tenant with ID ${tenantId} not found`);
    }

    // Fetch all data from Shopify
    console.log('Fetching products...');
    const products = await fetchAllProducts(accessToken, shopDomain);
    
    console.log('Fetching customers...');
    const customers = await fetchAllCustomers(accessToken, shopDomain);
    
    console.log('Fetching orders...');
    const orders = await fetchAllOrders(accessToken, shopDomain);

    // Sync to database (customers first, then orders, then products)
    console.log('Syncing customers...');
    await syncCustomers(customers, tenantId);
    
    console.log('Syncing orders...');
    await syncOrders(orders, tenantId);
    
    console.log('Syncing products...');
    await syncProducts(products, tenantId);

    console.log(`Sync completed successfully for tenant ${tenantId}`);
    
    return {
      success: true,
      stats: {
        products: products.length,
        customers: customers.length,
        orders: orders.length,
      },
    };
  } catch (error) {
    console.error(`Error syncing store data for tenant ${tenantId}:`, error);
    throw error;
  }
}

module.exports = {
  syncStoreData,
};

