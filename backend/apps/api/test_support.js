const { PrismaClient } = require('../../node_modules/@prisma/client');

const prisma = new PrismaClient();

async function test() {
  try {
    const broker = await prisma.broker.findFirst();
    if (!broker) {
      console.log("No broker found in database!");
      return;
    }
    console.log("Found broker ID:", broker.id);
    
    // Simulate transaction
    const count = await prisma.supportTicket.count();
    const ticketNumber = `TK-${1000 + count + 1}`;
    console.log("Simulating ticket creation:", ticketNumber);

    const result = await prisma.$transaction(async (tx) => {
      const ticket = await tx.supportTicket.create({
        data: {
          ticketNumber,
          brokerId: broker.id,
          subject: 'Test Subject',
          category: 'GENERAL',
          priority: 'MEDIUM',
          status: 'OPEN',
          lastMessageAt: new Date(),
          hasUnreadBrokerReply: true,
          hasUnreadAdminReply: false,
        },
      });
      console.log("Ticket created successfully!");

      const message = await tx.supportMessage.create({
        data: {
          ticketId: ticket.id,
          senderType: 'BROKER',
          senderId: broker.id,
          senderName: broker.companyName || 'Broker',
          content: 'Test message content',
        },
      });
      console.log("Message created successfully!");
      return { ticket, message };
    });
    console.log("Transaction success:", result);
  } catch (error) {
    console.error("Prisma Error Details:", error);
  } finally {
    await prisma.$disconnect();
  }
}

test();
