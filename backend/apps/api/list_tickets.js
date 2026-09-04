const { PrismaClient } = require('../../../node_modules/@prisma/client');

const prisma = new PrismaClient();

async function test() {
  try {
    const tickets = await prisma.supportTicket.findMany();
    console.log("Current tickets in database:");
    tickets.forEach(t => {
      console.log(`ID: ${t.id}, Number: ${t.ticketNumber}, Subject: ${t.subject}`);
    });
  } catch (error) {
    console.error("Prisma Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

test();
