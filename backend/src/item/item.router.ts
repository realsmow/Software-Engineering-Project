import { Input, Query, Router, UseMiddlewares } from 'nestjs-trpc';
import { AuthMiddleware } from '../trpc/auth.middleware';
import { z } from 'zod';
import {
  availabilityOutput,
  itemCategory,
  itemDetail,
  itemIdInput,
  itemUnit,
  listItemsInput,
  listRoomsInput,
  paginatedItems,
  paginatedRooms,
  roomIdInput,
  roomSummary,
  type ListItemsInput,
  type ListRoomsInput,
} from './item.schema';
import { ItemService } from './item.service';

/**
 * The catalogue: everything a borrower can search and read before deciding
 * what to request. Read-only - nothing here reserves, holds, or books.
 *
 * Every procedure requires a session. The catalogue is not public: which
 * equipment a faculty owns, and how much of it is missing, is not something to
 * hand out anonymously.
 *
 * Rooms live here rather than under `reservation` because searching a room and
 * searching a multimeter are the same act against the same table
 * (ResourceInfo); `reservation` is for booking one once it has been found.
 * Flagged for the team in docs/auth-admin.md - the contract did not name a
 * home for room search.
 */
@Router({ alias: 'item' })
export class ItemRouter {
  constructor(private readonly itemService: ItemService) {}

  /**
   * Catalogue search. `q` matches name, description and asset tag.
   * Default sort puts what can be borrowed today at the top.
   */
  @UseMiddlewares(AuthMiddleware)
  @Query({ input: listItemsInput, output: paginatedItems })
  list(@Input() input: ListItemsInput) {
    return this.itemService.list(input);
  }

  /** One equipment type with every unit, its condition and its due date. */
  @UseMiddlewares(AuthMiddleware)
  @Query({ input: itemIdInput, output: itemDetail })
  getById(@Input() input: { id: number }) {
    return this.itemService.getById(input.id);
  }

  /**
   * Live stock for one item. POLLED every 10-15s by the item page, so the
   * output is kept as small as it can be.
   */
  @UseMiddlewares(AuthMiddleware)
  @Query({ input: itemIdInput, output: availabilityOutput })
  getAvailability(@Input() input: { id: number }) {
    return this.itemService.getAvailability(input.id);
  }

  /** Units of one type - serial numbers, condition, and what is due back when. */
  @UseMiddlewares(AuthMiddleware)
  @Query({ input: itemIdInput, output: z.array(itemUnit) })
  listUnits(@Input() input: { id: number }) {
    return this.itemService.listUnits(input.id);
  }

  /** Not implemented - equipment has no category column or table. */
  @UseMiddlewares(AuthMiddleware)
  @Query({ output: z.array(itemCategory) })
  listCategories() {
    return this.itemService.listCategories();
  }

  /** Room and facility search. `q` matches name, description and location. */
  @UseMiddlewares(AuthMiddleware)
  @Query({ input: listRoomsInput, output: paginatedRooms })
  listRooms(@Input() input: ListRoomsInput) {
    return this.itemService.listRooms(input);
  }

  @UseMiddlewares(AuthMiddleware)
  @Query({ input: roomIdInput, output: roomSummary })
  getRoomById(@Input() input: { id: number }) {
    return this.itemService.getRoomById(input.id);
  }
}
