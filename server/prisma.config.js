// Prisma 7 configuration file
// Connection URL for migrations is defined here instead of schema.prisma
module.exports = {
  datasource: {
    url: process.env.DATABASE_URL,
  },
};

