/**
 * English wording for the codes in error-messages.ts. Same keys; a code with no
 * entry here falls back to the Thai text there.
 */
export const ERROR_MESSAGES_EN: Record<string, string> = {
  // Auth
  UNAUTHORIZED: "Please sign in again.",
  FORBIDDEN: "You do not have permission to access this.",
  INVALID_DOMAIN: "Only @ku.th or @ku.ac.th email addresses are supported.",
  ACCOUNT_NOT_FOUND: "No account exists for this email. Please ask an administrator to create one first.",

  // Loan request
  CONFLICT_UNIT_TAKEN: "This item has already been borrowed. Please choose another.",
  INSUFFICIENT_CREDIT: "Your credit is not enough for this loan.",
  ELIGIBILITY_NOT_MET: "You do not meet the conditions to borrow or reserve this item.",
  MAX_CONCURRENT_EXCEEDED: "You have more items out than allowed.",
  ALREADY_HAS_PENDING: "You already have a request awaiting approval.",

  // Booking / Reservation
  SLOT_UNAVAILABLE: "This time slot is no longer available.",
  RESERVATION_TOO_FAR: "You can reserve at most 3 months ahead.",
  ROOM_SLOT_OUT_OF_RANGE: "The selected time does not match the room's booking slots (30 minutes each).",
  ROOM_SLOT_LIMIT_EXCEEDED: "A room can be booked for at most 3 hours at a time.",
  ROOM_SLOTS_NOT_CONTIGUOUS: "The selected slots must be consecutive and cannot span the lunch break.",
  ROOM_SLOT_IN_THE_PAST: "This time slot has already passed.",
  ROOM_BOOKING_SAME_DAY_ONLY: "Rooms can only be booked for today.",
  ROOM_BOOKING_LIMIT_REACHED: "You already have one room booked. Cancel it or finish using it before booking another.",
  ROOM_NOT_EXTENDABLE: "This room cannot be extended. If the next slot is free, please book it instead.",
  TOO_MANY_REQUESTS: "Too many requests from this device. Please wait a moment and try again.",
  PICKUP_NOT_OPEN: "It is not pickup time yet. If you arrive early, counter staff can hand it over ahead of time.",

  // Reservation horizon
  T0_NOT_RESERVABLE: "Equipment at this level can only be borrowed on the spot from available stock, not reserved for later days.",
  RESERVATION_PAST_TERM_END: "You can reserve at most until the end of the current term.",
  OUTSIDE_WORK_HOURS: "The pickup or return time is outside counter hours. Please choose another time.",

  // Renewal
  RENEWAL_LIMIT_REACHED: "You have used all your online renewals. Please bring the item to staff for inspection.",
  RENEWAL_REQUIRES_SUPERVISOR: "This renewal needs supervisor approval.",

  // Pickup / Return
  PICKUP_EXPIRED: "The pickup time has passed and the request was cancelled.",
  ALREADY_RETURNED: "This item has already been returned.",

  // Backend business error codes
  ITEM_UNAVAILABLE: "This item has already been borrowed. Please choose another.",
  SLOT_TAKEN: "This time slot is no longer available.",
  WINDOW_NOT_AVAILABLE: "This time slot is no longer available.",
  SERIAL_NOT_AVAILABLE: "This serial number is already reserved for this period. Please choose another serial number.",
  WINDOW_CROSSES_RESERVATION: "This period overlaps another reservation on this unit. Please shorten the loan or choose a new period.",
  TRANSACTION_CONFLICT: "Several people are booking at the same time. Please try again.",
  SLOT_LIMIT_EXCEEDED: "You can hold at most 2 rooms or slots at once.",
  NOT_ELIGIBLE: "You do not meet the conditions to borrow or reserve this item.",
  ALREADY_DECIDED: "This request has already been handled and cannot be changed.",
  SERIAL_REQUIRED_FOR_TIER: "Equipment at this level needs its serial number.",
  BULK_NOT_ALLOWED_FOR_TIER:
    "T2 equipment can be registered one unit at a time because each unit is tied to the serial number on the device.",
  LOAN_PERIOD_EXCEEDS_LIMIT: "The loan period exceeds what you are allowed.",
  EXTENSION_QUOTA_EXCEEDED: "You have used all your online renewals. Please bring the item to staff for inspection.",
  APPEAL_WINDOW_CLOSED: "The appeal period for this item has closed.",
  ALREADY_APPEALED: "This penalty has already been appealed.",
  PENALTY_NOT_FOUND: "This penalty was not found.",
  NOT_YOUR_PENALTY: "You can only appeal your own penalties.",
  PENALTY_NOT_IN_EFFECT: "This penalty is no longer in effect, so there is nothing to appeal.",
  PENALTY_NOT_APPEALABLE:
    "Only damage assessments can be appealed. Late or lost penalties are based on time and cannot be appealed.",
  EXTENSION_ALREADY_PENDING: "An extension request is already awaiting review.",
  INVALID_EXTENSION_WINDOW: "The requested date is outside the extendable range.",

  // Staff counter
  WRONG_LOAN_STATE:
    "This item was already processed (another staff member may have done it first). Please refresh the queue.",
  LOAN_NOT_FOUND: "This loan was not found. It may have been cancelled or already processed.",
  PICKUP_PHOTO_REQUIRED: "Please photograph the equipment before confirming pickup.",
  RETURN_PHOTO_REQUIRED: "Please photograph the equipment on return before recording the return.",
  DAMAGE_PHOTO_REQUIRED: "Please attach at least one photo of the damage for grades B1 to B3.",
  RESERVATION_NOT_FOUND: "This request was not found. It may have been cancelled.",
  RESOURCE_NOT_FOUND: "This item was not found in the system.",
  NOT_APPROVED_YET: "This request has not been approved yet, so it cannot be prepared.",
  NOT_YET_LOST: "It is too early to record this as lost (it must be 2 weeks past due).",
  UNIT_DOES_NOT_MATCH_REQUEST: "The selected unit does not match what the borrower requested.",
  UNIT_SWAP_NOT_ALLOWED: "Equipment at this level cannot be swapped at the counter.",
  TIER_NOT_CONFIGURED: "The borrowing tier for this item is not set up. Please tell an administrator.",
  NO_MANAGEMENT_SCOPE: "You do not manage the department that owns this item.",

  // Approval desk
  CANNOT_APPROVE_OWN_REQUEST: "You cannot approve your own request.",
  APPROVAL_NEEDS_SUPERVISOR: "This request must be approved by a supervisor.",
  CREDIT_TOO_LOW: "The borrower's credit is below the threshold for this item.",
  INVALID_BORROW_WINDOW: "The requested borrowing period is not valid.",
  CANNOT_CANCEL: "This request can no longer be cancelled.",
  EXTENSION_NOT_FOUND: "This extension request was not found.",
  EXTENSION_NEEDS_SUPERVISOR: "This extension needs supervisor approval.",
  EXTENSION_NOT_INSPECTED: "Staff must inspect the equipment before the extension can be approved.",
  EXTENSION_INSPECTION_NOT_NEEDED: "This request can record the condition together with approval at the counter.",
  TOO_MANY_ATTEMPTS: "Too many attempts. Please wait a moment and try again.",

  // File upload
  FILE_TOO_LARGE: "The file is too large (5 MB maximum).",
  INVALID_FILE_TYPE: "Only image files are allowed (JPG, PNG).",

  // Session and account state
  NOT_AUTHENTICATED: "Your session has expired. Please sign in again.",
  ROLE_NOT_ALLOWED: "Your account is not allowed to use this section.",
  INVALID_CREDENTIALS: "Incorrect username or password.",
  ACCOUNT_DISABLED: "This account has been suspended. Please contact an administrator.",

  // Accounts (admin)
  USER_NOT_FOUND: "This user account was not found.",
  AUDIT_EVENT_NOT_FOUND: "This log entry was not found.",
  EMAIL_ALREADY_IN_USE: "This email is already used by another account.",
  USER_ID_ALREADY_IN_USE: "This user ID is already used by another account.",
  FACULTY_NOT_FOUND: "This faculty was not found.",
  GROUP_NOT_FOUND: "This department or club was not found.",
  ORG_IN_USE: "It cannot be deleted while people, equipment, departments or borrowing rules still use it. Move them first.",
  ORG_LAST_ONE: "It cannot be deleted because it is the last one. The system needs at least one.",
  CANNOT_MODIFY_SELF: "You cannot change your own role or suspend your own account.",
  ROLE_CHANGE_WOULD_ORPHAN_GROUP:
    "The role cannot be changed because a department this user manages would be left without a manager. Please assign someone else in that department first.",
  DISABLE_WOULD_ORPHAN_GROUP:
    "This account cannot be disabled because a department this user manages would be left without a manager. Please assign someone else in that department first.",
  MEMBERSHIP_REMOVAL_WOULD_ORPHAN_GROUP:
    "This user cannot be removed from the department because it would be left without a manager. Please assign someone else in that department first.",

  // Departmental scope
  OUT_OF_MANAGEMENT_SCOPE: "This item is outside the department you manage.",
  ITEM_NOT_FOUND: "This item was not found.",
  ITEM_TYPE_NOT_FOUND: "This item type was not found.",
  ROOM_NOT_FOUND: "This location was not found.",
  BORROW_RULE_NOT_FOUND: "This borrowing rule was not found.",
  SERIAL_ALREADY_IN_USE: "This serial number is already used by another item.",
  RESOURCE_IN_USE: "The item is with a borrower. It must be returned before this can be done.",

  // Delete / retirement
  HAS_HISTORY: "This cannot be deleted because it already has usage history.",
  INVALID_ROOM_HOURS: "The room's opening and closing times are not valid. Please check the hours and break.",
  RETIREMENT_REQUEST_NOT_FOUND: "This retirement request was not found.",
  RETIREMENT_ALREADY_PENDING: "This item already has a retirement request awaiting review.",
  RETIREMENT_ALREADY_DECIDED: "This retirement request has already been handled.",
  NOT_YOUR_RETIREMENT_REQUEST: "You can only cancel your own retirement requests.",
  CANNOT_DECIDE_OWN_RETIREMENT: "You cannot decide your own retirement request.",
  RESOURCE_ALREADY_RETIRED: "This item has already been retired.",
  RETIREMENT_BLOCKED_BY_ACTIVITY: "This cannot be done because the item is on loan or has a future reservation.",

  // Inspection
  INSPECTION_NOT_FOUND: "This inspection result was not found.",
  ALREADY_INSPECTED: "This item has already been inspected. If you disagree, please file an appeal.",
  CANNOT_INSPECT_OWN_PREPARATION: "You prepared this item, so you cannot inspect it. Please ask another staff member.",

  // Appeals
  APPEAL_NOT_FOUND: "This appeal was not found.",
  APPEAL_ALREADY_RESOLVED: "This appeal has already been decided. Please refresh the list.",
  CANNOT_DECIDE_OWN_APPEAL: "You cannot decide your own appeal.",
  CANNOT_DECIDE_OWN_INSPECTION: "You inspected this item, so you cannot decide this appeal. Please ask someone else.",
  INVALID_APPEAL_REDUCTION: "The reduced credit must be less than the original deduction. To reduce nothing, choose reject.",

  // Approval queue
  ALREADY_AUTO_APPROVED: "The system already approved this request automatically. No decision is needed.",

  // Notifications
  NOTIFICATION_NOT_FOUND: "This notification was not found.",

  // File upload
  UPLOAD_TICKET_INVALID: "The upload link has expired or is not valid. Please try again.",
  UPLOAD_TYPE_MISMATCH: "The file type does not match what was requested.",
  UPLOAD_TOO_LARGE: "The file is larger than allowed.",
  UPLOAD_EMPTY: "The file is empty.",
  UPLOAD_ALREADY_STORED: "This file has already been uploaded.",
  UPLOAD_NOT_STORED: "The uploaded file was not found. Please send the photo again.",
  TOO_MANY_PHOTOS: "You have attached the maximum number of photos for this step.",
  UPLOAD_NOT_AN_IMAGE: "This file is not an image.",
  UPLOAD_REJECTED: "Upload failed. Please try again.",

  // Usage/check-in photos
  IMAGE_NOT_FOUND: "This image was not found. It may have been deleted.",
  NOT_YOUR_PHOTO: "You can only delete photos you uploaded yourself.",
  EVIDENCE_NOT_ALLOWED:
    "Evidence can only be attached while a damage penalty can still be appealed, or an appeal is awaiting review.",

  // Configuration problems
  ROLE_NOT_CONFIGURED: "This role is not set up in the system. Please tell an administrator.",
  RESET_TOKEN_INVALID: "This link has expired or was already used. Please request a new one.",
  VERIFICATION_TOKEN_INVALID: "This verification link has expired or was already used. Please register again.",
  CURRENT_PASSWORD_INCORRECT: "The current password is incorrect.",
  PASSWORD_UNCHANGED: "The new password must differ from the current one.",
  CREDIT_TIER_NOT_CONFIGURED: "No credit tier covers this score. Please tell an administrator.",
  NOT_IMPLEMENTED: "This feature is not available yet.",

  // Generic
  VALIDATION_ERROR: "The information entered is not valid.",
  NOT_FOUND: "The requested data was not found.",
  RATE_LIMIT: "You are sending requests too quickly. Please wait a moment.",
  SERVER_ERROR: "A system error occurred. Please try again.",
  UNKNOWN_ERROR: "An unknown error occurred.",
};
