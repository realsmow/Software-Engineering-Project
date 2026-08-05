import "dotenv/config";
import { PrismaClient } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

console.log(process.env.DATABASE_URL);

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

export const prisma = new PrismaClient({ adapter });

async function main() {
    const types = await prisma.groupType.findMany();

    console.log(types)
}

main()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
    });