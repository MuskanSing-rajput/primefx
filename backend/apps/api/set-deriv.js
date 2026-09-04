const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  try {
    const keys = [
      { key: 'streaming:source', value: 'deriv', category: 'streaming' },
      { key: 'streaming:deriv:appId', value: '1089', category: 'streaming' }
    ];
    for (const item of keys) {
      await prisma.systemSetting.upsert({
        where: { key: item.key },
        update: { value: item.value },
        create: {
          key: item.key,
          value: item.value,
          category: item.category
        }
      });
      console.log('Upserted:', item.key, '=', item.value);
    }
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
run();
