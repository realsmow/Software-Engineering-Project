import { Test } from '@nestjs/testing';
import { AppModule } from './app.module';
import { PrismaService } from './prisma.service';
import { ItemRouter } from './item/item.router';
import { LoanRouter } from './loan/loan.router';
import { InspectionRouter } from './inspection/inspection.router';
import { ImageRouter } from './image/image.router';
import { ImageController } from './image/image.controller';

/**
 * Wiring check for the whole module, with the database stubbed out.
 *
 * Missing providers are the one class of mistake that compiles cleanly and then
 * kills the process on boot — adding a service to a constructor without adding
 * it to `providers` costs nothing until `npm run start` refuses to come up. This
 * catches it in CI, where there is no Postgres to connect to.
 */
describe('AppModule', () => {
  async function compile() {
    return (
      Test.createTestingModule({ imports: [AppModule] })
        // The real one opens a connection in onModuleInit. Nothing here calls a
        // query; the point is only that every provider can be constructed.
        .overrideProvider(PrismaService)
        .useValue({ $connect: jest.fn(), $disconnect: jest.fn() })
        .compile()
    );
  }

  it('resolves every staff router and its dependencies', async () => {
    const moduleRef = await compile();

    expect(moduleRef.get(ItemRouter)).toBeInstanceOf(ItemRouter);
    expect(moduleRef.get(LoanRouter)).toBeInstanceOf(LoanRouter);
    expect(moduleRef.get(InspectionRouter)).toBeInstanceOf(InspectionRouter);
    expect(moduleRef.get(ImageRouter)).toBeInstanceOf(ImageRouter);
    // The upload route is a controller, not a router — main.ts also reads
    // ImageService off the container to mount the static directory.
    expect(moduleRef.get(ImageController)).toBeInstanceOf(ImageController);

    await moduleRef.close();
  });
});
