# Shopify Data Ingestion & Insights Service

A multi-tenant system that connects to Shopify, ingests data from multiple stores, stores it in a relational database, and provides analytics visualization through a modern web dashboard.

## Tech Stack

- **Backend**: Node.js with Express
- **Database**: PostgreSQL with Prisma ORM
- **Frontend**: Next.js (App Router) with Tailwind CSS
- **Charts**: Recharts
- **API Client**: Axios

## Project Structure

```
.
├── client/                    # Next.js frontend application
│   ├── app/                   # Next.js App Router pages
│   │   ├── dashboard/        # Analytics dashboard page
│   │   └── layout.js         # Root layout
│   ├── components/            # React components
│   │   └── StatCard.js       # Reusable stat card component
│   └── lib/                   # Utility functions
│       └── api.js            # API client functions
│
└── server/                    # Node.js + Express backend
    ├── prisma/
    │   └── schema.prisma     # Database schema definition
    ├── routes/
    │   └── analytics.js      # Analytics API endpoints
    └── services/
        └── shopifyIngest.js  # Shopify data ingestion service
```

## High-Level Architecture

### Data Flow

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│   Shopify   │────────│  Node.js     │────────│ PostgreSQL  │
│   Store     │  API   │  Server      │ Prisma │  Database   │
│             │  Calls │  (Express)   │  ORM   │             │
└─────────────┘         └──────────────┘         └─────────────┘
                              │
                              │ REST API
                              │
                       ┌──────▼──────┐
                       │   Next.js   │
                       │   Frontend  │
                       │  (Dashboard)│
                       └─────────────┘
```

### How It Works

1. **Data Ingestion** (`server/services/shopifyIngest.js`):

   - The Node.js server uses Axios to make HTTP requests to Shopify's Admin REST API (version 2023-10)
   - Fetches Products, Customers, and Orders from Shopify stores using pagination
   - Implements rate limiting (2 requests/second) to respect Shopify API limits
   - Handles API errors gracefully with retry logic for rate limits (429) and server errors (5xx)
   - Uses Prisma ORM to write data to PostgreSQL with `upsert` operations to prevent duplicates
   - All data is scoped by `tenantId` to ensure multi-tenant isolation

2. **Data Storage**:

   - PostgreSQL database stores all ingested data
   - Prisma ORM manages database connections and queries
   - Foreign key relationships ensure data integrity
   - Cascade deletes maintain referential integrity

3. **Analytics API** (`server/routes/analytics.js`):

   - Express router provides REST endpoints for analytics queries
   - All endpoints require `tenantId` query parameter for data isolation
   - Aggregates data from PostgreSQL using Prisma queries
   - Returns JSON responses for frontend consumption

4. **Frontend Dashboard** (`client/app/dashboard/`):
   - Next.js application fetches data from analytics API
   - Displays statistics in card components
   - Visualizes sales trends using Recharts line chart
   - Shows top customers in a responsive table

## Database Schema

The system uses a multi-tenant architecture with the following tables:

### `tenants`

Stores Shopify store credentials and configuration.

| Column      | Type     | Description                    |
| ----------- | -------- | ------------------------------ |
| id          | UUID     | Primary key                    |
| shopDomain  | String   | Shopify store domain (unique)  |
| accessToken | String   | Shopify Admin API access token |
| email       | String   | Store owner email              |
| createdAt   | DateTime | Record creation timestamp      |
| updatedAt   | DateTime | Record last update timestamp   |

### `products`

Stores product information from Shopify stores.

| Column           | Type     | Description                        |
| ---------------- | -------- | ---------------------------------- |
| id               | UUID     | Primary key                        |
| shopifyProductId | String   | Shopify product ID (unique)        |
| title            | String   | Product title                      |
| price            | Decimal  | Product price (from first variant) |
| tenantId         | UUID     | Foreign key to `tenants.id`        |
| createdAt        | DateTime | Record creation timestamp          |
| updatedAt        | DateTime | Record last update timestamp       |

**Indexes**: `tenantId`, `shopifyProductId`

### `customers`

Stores customer information from Shopify stores.

| Column            | Type     | Description                          |
| ----------------- | -------- | ------------------------------------ |
| id                | UUID     | Primary key                          |
| shopifyCustomerId | String   | Shopify customer ID (unique)         |
| firstName         | String?  | Customer first name (nullable)       |
| lastName          | String?  | Customer last name (nullable)        |
| email             | String   | Customer email address               |
| totalSpend        | Decimal  | Calculated total spend across orders |
| tenantId          | UUID     | Foreign key to `tenants.id`          |
| createdAt         | DateTime | Record creation timestamp            |
| updatedAt         | DateTime | Record last update timestamp         |

**Indexes**: `tenantId`, `shopifyCustomerId`, `email`

### `orders`

Stores order information from Shopify stores.

| Column         | Type     | Description                      |
| -------------- | -------- | -------------------------------- |
| id             | UUID     | Primary key                      |
| shopifyOrderId | String   | Shopify order ID (unique)        |
| totalPrice     | Decimal  | Order total price                |
| createdAt      | DateTime | Order creation date from Shopify |
| customerId     | UUID     | Foreign key to `customers.id`    |
| tenantId       | UUID     | Foreign key to `tenants.id`      |
| createdAtDb    | DateTime | Record creation timestamp in DB  |
| updatedAt      | DateTime | Record last update timestamp     |

**Indexes**: `tenantId`, `customerId`, `shopifyOrderId`, `createdAt`

### Relationships

- `Tenant` → `Product` (one-to-many)
- `Tenant` → `Customer` (one-to-many)
- `Tenant` → `Order` (one-to-many)
- `Customer` → `Order` (one-to-many)

All relationships use cascade delete to maintain referential integrity.

## Setup Instructions

### Prerequisites

- Node.js (v18 or higher)
- PostgreSQL (v12 or higher)
- npm or yarn package manager
- A Shopify store with Admin API access (for testing)

### Server Setup

1. **Navigate to the server directory:**

   ```bash
   cd server
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Set up environment variables:**

   Create a `.env` file in the `server` directory:

   ```bash
   cp .env.example .env
   ```

   Edit `.env` with your configuration:

   ```env
   # PostgreSQL Database Connection
   DATABASE_URL="postgresql://username:password@localhost:5432/shopify_ingestion?schema=public"

   # Server Configuration (optional)
   PORT=3001
   NODE_ENV=development
   ```

   **Database URL Format:**

   - Replace `username` with your PostgreSQL username
   - Replace `password` with your PostgreSQL password
   - Replace `localhost:5432` with your database host and port if different
   - Replace `shopify_ingestion` with your desired database name

4. **Generate Prisma Client:**

   ```bash
   npm run prisma:generate
   ```

5. **Run database migrations:**

   ```bash
   npm run prisma:migrate
   ```

   This will create all tables in your PostgreSQL database.

6. **(Optional) Seed test data:**

   You can create a tenant manually using Prisma Studio:

   ```bash
   npm run prisma:studio
   ```

   Or use the Prisma Client in a script to create a tenant with Shopify credentials.

7. **Start the server:**

   ```bash
   npm run dev
   ```

   The server will start on `http://localhost:3001` (or the port specified in your `.env`).

### Client Setup

1. **Navigate to the client directory:**

   ```bash
   cd client
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Set up environment variables (optional):**

   Create a `.env.local` file in the `client` directory:

   ```env
   NEXT_PUBLIC_API_URL=http://localhost:3001/api
   ```

   If not set, it defaults to `http://localhost:3001/api`.

4. **Start the development server:**

   ```bash
   npm run dev
   ```

   The client will start on `http://localhost:3000`.

5. **Access the dashboard:**

   Open your browser and navigate to:

   ```
   http://localhost:3000/dashboard
   ```

### Running Data Ingestion

To sync data from a Shopify store, you'll need to call the ingestion service. You can do this by:

1. **Creating a tenant** in the database with Shopify credentials:

   ```javascript
   const { PrismaClient } = require("@prisma/client");
   const prisma = new PrismaClient();

   const tenant = await prisma.tenant.create({
     data: {
       shopDomain: "your-store", // without .myshopify.com
       accessToken: "shpat_xxxxxxxxxxxxx", // Your Shopify Admin API token
       email: "store@example.com",
     },
   });
   ```

2. **Calling the sync function:**

   ```javascript
   const { syncStoreData } = require("./services/shopifyIngest");

   await syncStoreData(tenant.id, tenant.accessToken, tenant.shopDomain);
   ```

   Or create an API endpoint to trigger the sync (recommended for production).

## API Endpoints

### Analytics Endpoints

All analytics endpoints require a `tenantId` query parameter.

**Base URL**: `http://localhost:3001/api/analytics`

#### GET `/stats`

Returns total customer count, total order count, and total revenue.

**Query Parameters:**

- `tenantId` (required): UUID of the tenant

**Response:**

```json
{
  "success": true,
  "data": {
    "totalCustomers": 150,
    "totalOrders": 320,
    "totalRevenue": 45230.5
  }
}
```

#### GET `/sales-over-time`

Returns sales data grouped by date for line chart visualization.

**Query Parameters:**

- `tenantId` (required): UUID of the tenant

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "date": "2024-01-01",
      "totalSales": 1250.0
    },
    {
      "date": "2024-01-02",
      "totalSales": 1890.5
    }
  ]
}
```

#### GET `/top-customers`

Returns the top 5 customers ordered by total spend.

**Query Parameters:**

- `tenantId` (required): UUID of the tenant

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "firstName": "John",
      "lastName": "Doe",
      "email": "john@example.com",
      "totalSpend": 5420.0,
      "fullName": "John Doe"
    }
  ]
}
```

## Assumptions

### Currency

- **USD (US Dollar)** is assumed as the default currency throughout the system
- All monetary values are stored and displayed in USD
- Currency conversion is not implemented in this demo

### Authentication & Authorization

- **Simplified authentication flow** is used for this demo
- No OAuth or JWT token validation is implemented
- `tenantId` is passed as a query parameter (in production, this should be extracted from authenticated session)
- Shopify access tokens are stored in plain text (in production, these should be encrypted)

### Data Handling

- Only orders with associated customers are synced (guest checkout orders are skipped)
- Product prices are taken from the first variant (multi-variant pricing is simplified)
- Customer `totalSpend` is calculated from orders and updated after order sync
- Data ingestion uses upsert operations to prevent duplicates on re-sync

### API Rate Limiting

- Shopify REST API rate limit of 2 requests/second is enforced
- Automatic retry logic handles 429 (rate limit) and 5xx (server error) responses
- Pagination is handled automatically using Shopify's Link header pagination

### Multi-Tenancy

- Data isolation is enforced at the database level using `tenantId` foreign keys
- All queries filter by `tenantId` to ensure tenant isolation
- No cross-tenant data access is possible through the API

## Development

### Running in Development Mode

**Server:**

```bash
cd server
npm run dev  # Uses nodemon for auto-reload
```

**Client:**

```bash
cd client
npm run dev  # Next.js development server with hot reload
```

### Database Management

**Open Prisma Studio:**

```bash
cd server
npm run prisma:studio
```

**Create a new migration:**

```bash
cd server
npm run prisma:migrate
```

**Reset database (WARNING: Deletes all data):**

```bash
cd server
npx prisma migrate reset
```

## License

This project is created for technical assessment purposes.
"# Shopify-Ingestion-Xeno" 
