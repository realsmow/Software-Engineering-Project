import { ApprovalRouter } from '../../src/approval/approval.router';
import {
  decideExtensionInput,
  extensionOutput,
} from '../../src/loan/loan.schema';
import type { TrpcUser } from '../../src/trpc/context';

const supervisor: TrpcUser = {
  accountKey: 99,
  role: 'supervisor',
  facultyKey: null,
  creditScore: 100,
};

it('forwards a parsed supervisor extension decision through the actual router', async () => {
  const input = decideExtensionInput.parse({
    extensionKey: 12,
    decision: 'approve',
    condition: 'Normal',
    note: 'Approved after inspection',
  });
  const output = extensionOutput.strict().parse({
    extensionKey: 12,
    usageKey: 42,
    status: 'Approved',
    route: 'supervisor',
    requiresInspection: true,
    autoApproved: false,
    extendNo: 1,
    previousDueAt: '2026-09-24T09:00:00.000Z',
    requestedDueAt: '2026-09-25T09:00:00.000Z',
    dueAt: '2026-09-25T09:00:00.000Z',
    requestedAt: '2026-09-24T08:00:00.000Z',
    resolvedAt: '2026-09-24T09:00:00.000Z',
    itemName: 'Laptop',
    serialNo: 'ITEM-42',
    tier: 'T2',
    extensionsUsed: 1,
    extensionsAllowed: 1,
  });
  const extensions = { decide: jest.fn().mockResolvedValue(output) };
  const router = new ApprovalRouter({} as never, extensions as never);
  const result = extensionOutput
    .strict()
    .parse(await router.decideExtension(input, { user: supervisor } as never));
  expect(extensions.decide).toHaveBeenCalledWith(supervisor, input);
  expect(result).toEqual(output);
});
