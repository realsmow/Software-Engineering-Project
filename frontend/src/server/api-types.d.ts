/**
 * GENERATED FILE - DO NOT EDIT.
 *
 * Type-only snapshot of the backend tRPC AppRouter, produced by
 * backend/scripts/export-api-types.mjs (`npm run api:types` in backend).
 * Regenerate after any backend router/schema change and commit the result -
 * CI fails if this file would differ from a fresh run.
 *
 * See docs/trpc-guide.tex for the full workflow.
 */
declare const appRouter: import("@trpc/server").TRPCBuiltRouter<{
	ctx: object;
	meta: object;
	errorShape: import("@trpc/server").TRPCDefaultErrorShape;
	transformer: false;
}, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
	admin: import("@trpc/server").TRPCBuiltRouter<{
		ctx: object;
		meta: object;
		errorShape: import("@trpc/server").TRPCDefaultErrorShape;
		transformer: false;
	}, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
		listUsers: import("@trpc/server").TRPCQueryProcedure<{
			input: {
				page?: number | undefined;
				pageSize?: number | undefined;
				q?: string | undefined;
				sort?: string | undefined;
				order?: "asc" | "desc" | undefined;
				role?: "borrower" | "staff" | "supervisor" | "admin" | undefined;
				status?: "active" | "disabled" | undefined;
			};
			output: {
				items: {
					id: number;
					studentId: string;
					firstName: string;
					lastName: string;
					email: string;
					role: "borrower" | "staff" | "supervisor" | "admin";
					status: "active" | "disabled";
					creditScore: number;
					managementGroup: {
						id: number;
						name: string | null;
						type: "Club" | "Faculty";
					} | null;
				}[];
				total: number;
				page: number;
				pageSize: number;
			};
			meta: object;
		}>;
		listUsersInScope: import("@trpc/server").TRPCQueryProcedure<{
			input: {
				page?: number | undefined;
				pageSize?: number | undefined;
				q?: string | undefined;
				sort?: string | undefined;
				order?: "asc" | "desc" | undefined;
				role?: "borrower" | "staff" | "supervisor" | "admin" | undefined;
				status?: "active" | "disabled" | undefined;
			};
			output: {
				items: {
					id: number;
					studentId: string;
					firstName: string;
					lastName: string;
					email: string;
					role: "borrower" | "staff" | "supervisor" | "admin";
					status: "active" | "disabled";
					creditScore: number;
					managementGroup: {
						id: number;
						name: string | null;
						type: "Club" | "Faculty";
					} | null;
				}[];
				total: number;
				page: number;
				pageSize: number;
			};
			meta: object;
		}>;
		getUserById: import("@trpc/server").TRPCQueryProcedure<{
			input: {
				id: number;
			};
			output: {
				id: number;
				studentId: string;
				firstName: string;
				lastName: string;
				email: string;
				role: "borrower" | "staff" | "supervisor" | "admin";
				status: "active" | "disabled";
				creditScore: number;
				managementGroup: {
					id: number;
					name: string | null;
					type: "Club" | "Faculty";
				} | null;
				creditTier: "D0" | "D1" | "D2" | "D3";
				maxBorrowDays: number;
				maxExtendTimes: number;
				authorities: {
					manageGroupKey: number;
					groupName: string | null;
					groupType: "Club" | "Faculty";
					authorityName: string;
					authorityLevel: number | null;
				}[];
				activePenalties: {
					id: number;
					reason: string | null;
					usageKey: number | null;
					creditDeducted: number | null;
					issuedAt: string | null;
					expiresAt: string;
					appealed: boolean;
				}[];
			};
			meta: object;
		}>;
		getUserLoans: import("@trpc/server").TRPCQueryProcedure<{
			input: {
				id: number;
			};
			output: {
				id: number;
				itemName: string;
				status: string;
				checkoutTime: string;
				dueTime: string;
				checkInTime: string | null;
			}[];
			meta: object;
		}>;
		createUser: import("@trpc/server").TRPCMutationProcedure<{
			input: {
				email: string;
				studentId: string;
				firstName: string;
				lastName: string;
				role: "borrower" | "staff" | "supervisor" | "admin";
				password?: string | undefined;
			};
			output: {
				user: {
					id: number;
					studentId: string;
					firstName: string;
					lastName: string;
					email: string;
					role: "borrower" | "staff" | "supervisor" | "admin";
					status: "active" | "disabled";
					creditScore: number;
					managementGroup: {
						id: number;
						name: string | null;
						type: "Club" | "Faculty";
					} | null;
					creditTier: "D0" | "D1" | "D2" | "D3";
					maxBorrowDays: number;
					maxExtendTimes: number;
					authorities: {
						manageGroupKey: number;
						groupName: string | null;
						groupType: "Club" | "Faculty";
						authorityName: string;
						authorityLevel: number | null;
					}[];
					activePenalties: {
						id: number;
						reason: string | null;
						usageKey: number | null;
						creditDeducted: number | null;
						issuedAt: string | null;
						expiresAt: string;
						appealed: boolean;
					}[];
				};
				temporaryPassword: string | null;
			};
			meta: object;
		}>;
		updateUser: import("@trpc/server").TRPCMutationProcedure<{
			input: {
				id: number;
				email?: string | undefined;
				studentId?: string | undefined;
				firstName?: string | undefined;
				lastName?: string | undefined;
			};
			output: {
				id: number;
				studentId: string;
				firstName: string;
				lastName: string;
				email: string;
				role: "borrower" | "staff" | "supervisor" | "admin";
				status: "active" | "disabled";
				creditScore: number;
				managementGroup: {
					id: number;
					name: string | null;
					type: "Club" | "Faculty";
				} | null;
				creditTier: "D0" | "D1" | "D2" | "D3";
				maxBorrowDays: number;
				maxExtendTimes: number;
				authorities: {
					manageGroupKey: number;
					groupName: string | null;
					groupType: "Club" | "Faculty";
					authorityName: string;
					authorityLevel: number | null;
				}[];
				activePenalties: {
					id: number;
					reason: string | null;
					usageKey: number | null;
					creditDeducted: number | null;
					issuedAt: string | null;
					expiresAt: string;
					appealed: boolean;
				}[];
			};
			meta: object;
		}>;
		changeRole: import("@trpc/server").TRPCMutationProcedure<{
			input: {
				id: number;
				role: "borrower" | "staff" | "supervisor" | "admin";
			};
			output: {
				id: number;
				studentId: string;
				firstName: string;
				lastName: string;
				email: string;
				role: "borrower" | "staff" | "supervisor" | "admin";
				status: "active" | "disabled";
				creditScore: number;
				managementGroup: {
					id: number;
					name: string | null;
					type: "Club" | "Faculty";
				} | null;
				creditTier: "D0" | "D1" | "D2" | "D3";
				maxBorrowDays: number;
				maxExtendTimes: number;
				authorities: {
					manageGroupKey: number;
					groupName: string | null;
					groupType: "Club" | "Faculty";
					authorityName: string;
					authorityLevel: number | null;
				}[];
				activePenalties: {
					id: number;
					reason: string | null;
					usageKey: number | null;
					creditDeducted: number | null;
					issuedAt: string | null;
					expiresAt: string;
					appealed: boolean;
				}[];
			};
			meta: object;
		}>;
		resetPassword: import("@trpc/server").TRPCMutationProcedure<{
			input: {
				id: number;
				newPassword?: string | undefined;
			};
			output: {
				ok: true;
				temporaryPassword: string | null;
			};
			meta: object;
		}>;
		setUserActive: import("@trpc/server").TRPCMutationProcedure<{
			input: {
				id: number;
				active: boolean;
			};
			output: {
				ok: true;
			};
			meta: object;
		}>;
		getLendingSettings: import("@trpc/server").TRPCQueryProcedure<{
			input: void;
			output: {
				workHours: {
					start: number;
					end: number;
				};
				creditTiers: {
					id: number;
					name: string | null;
					min: number;
					max: number;
				}[];
				borrowRules: {
					id: number;
					name: string | null;
					constraints: {
						creditTierKey: number;
						creditTierName: string | null;
						minimumAuthorityLevel: number | null;
						maxBorrowDays: number;
						maxExtendTimes: number;
					}[];
					penalties: {
						reason: "DamagedItem" | "BrokenItem" | "LostItem" | "DidntReturn" | "ReturnLate";
						amount: number;
						lengthDays: number;
					}[];
				}[];
			};
			meta: object;
		}>;
		updateLendingSettings: import("@trpc/server").TRPCMutationProcedure<{
			input: {
				borrowRuleKey: number;
				constraints?: {
					creditTierKey: number;
					maxBorrowDays: number;
					maxExtendTimes: number;
					minimumAuthorityLevel?: number | null | undefined;
				}[] | undefined;
				penalties?: {
					reason: "DamagedItem" | "BrokenItem" | "LostItem" | "DidntReturn" | "ReturnLate";
					amount: number;
					lengthDays: number;
				}[] | undefined;
			};
			output: {
				workHours: {
					start: number;
					end: number;
				};
				creditTiers: {
					id: number;
					name: string | null;
					min: number;
					max: number;
				}[];
				borrowRules: {
					id: number;
					name: string | null;
					constraints: {
						creditTierKey: number;
						creditTierName: string | null;
						minimumAuthorityLevel: number | null;
						maxBorrowDays: number;
						maxExtendTimes: number;
					}[];
					penalties: {
						reason: "DamagedItem" | "BrokenItem" | "LostItem" | "DidntReturn" | "ReturnLate";
						amount: number;
						lengthDays: number;
					}[];
				}[];
			};
			meta: object;
		}>;
		updateWorkHours: import("@trpc/server").TRPCMutationProcedure<{
			input: {
				start: number;
				end: number;
			};
			output: {
				workHours: {
					start: number;
					end: number;
				};
				creditTiers: {
					id: number;
					name: string | null;
					min: number;
					max: number;
				}[];
				borrowRules: {
					id: number;
					name: string | null;
					constraints: {
						creditTierKey: number;
						creditTierName: string | null;
						minimumAuthorityLevel: number | null;
						maxBorrowDays: number;
						maxExtendTimes: number;
					}[];
					penalties: {
						reason: "DamagedItem" | "BrokenItem" | "LostItem" | "DidntReturn" | "ReturnLate";
						amount: number;
						lengthDays: number;
					}[];
				}[];
			};
			meta: object;
		}>;
		getConfig: import("@trpc/server").TRPCQueryProcedure<{
			input: void;
			output: {
				auth: {
					googleOauthEnabled: boolean;
					localFallbackEnabled: boolean;
					allowedEmailDomains: string[];
					sessionTimeoutMinutes: number;
				};
				storage: {
					provider: string;
					bucket: string;
					maxUploadMb: number;
					presignedUploads: boolean;
				};
				email: {
					smtpHost: string;
					fromAddress: string;
					dueReminderEnabled: boolean;
				};
				polling: {
					availabilitySeconds: number;
					facilitySlotsSeconds: number;
					requestStatusSeconds: number;
					notificationsSeconds: number;
					staffQueueSeconds: number;
					supervisorQueueSeconds: number;
				};
				security: {
					cookieSecure: boolean;
					cookieSameSite: string;
					allowedOrigins: string[];
					nodeEnv: string;
				};
			};
			meta: object;
		}>;
		getSystemStatus: import("@trpc/server").TRPCQueryProcedure<{
			input: void;
			output: {
				checkedAt: string;
				uptimeSeconds: number;
				nodeVersion: string;
				database: {
					state: "operational" | "degraded" | "down";
					latencyMs: number | null;
				};
				counts: {
					accounts: number;
					resources: number;
					activeLoans: number;
					pendingReservations: number;
				};
			};
			meta: object;
		}>;
		listCronJobs: import("@trpc/server").TRPCQueryProcedure<{
			input: void;
			output: {
				id: "markOverdue" | "markLost" | "expireDemerits" | "dueSoonReminder" | "openT3InspectionRounds" | "expireStaleRequests";
				name: string;
				schedule: string;
				implemented: boolean;
				lastRunAt: string | null;
				lastResult: "success" | "failed" | "pending" | null;
				durationMs: number | null;
			}[];
			meta: object;
		}>;
		runCronJob: import("@trpc/server").TRPCMutationProcedure<{
			input: {
				job: "markOverdue" | "markLost" | "expireDemerits" | "dueSoonReminder" | "openT3InspectionRounds" | "expireStaleRequests";
			};
			output: {
				ok: true;
			};
			meta: object;
		}>;
		listAudit: import("@trpc/server").TRPCQueryProcedure<{
			input: {
				page?: number | undefined;
				pageSize?: number | undefined;
				q?: string | undefined;
				sort?: string | undefined;
				order?: "asc" | "desc" | undefined;
				action?: "role" | "login" | "create" | "update" | "delete" | "config" | undefined;
			};
			output: {
				items: {
					id: number;
					at: string;
					actorId: number | null;
					actorName: string;
					actorRole: "borrower" | "staff" | "supervisor" | "admin";
					action: "role" | "login" | "create" | "update" | "delete" | "config";
					target: string;
					ip: string | null;
					userAgent: string | null;
					detail: string;
				}[];
				total: number;
				page: number;
				pageSize: number;
			};
			meta: object;
		}>;
		getAuditById: import("@trpc/server").TRPCQueryProcedure<{
			input: {
				id: number;
			};
			output: {
				id: number;
				at: string;
				actorId: number | null;
				actorName: string;
				actorRole: "borrower" | "staff" | "supervisor" | "admin";
				action: "role" | "login" | "create" | "update" | "delete" | "config";
				target: string;
				ip: string | null;
				userAgent: string | null;
				detail: string;
			};
			meta: object;
		}>;
	}>>;
	appeal: import("@trpc/server").TRPCBuiltRouter<{
		ctx: object;
		meta: object;
		errorShape: import("@trpc/server").TRPCDefaultErrorShape;
		transformer: false;
	}, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
		appealable: import("@trpc/server").TRPCQueryProcedure<{
			input: void;
			output: {
				penaltyKey: number;
				usageKey: number | null;
				reason: string | null;
				creditDeducted: number | null;
				issuedAt: string | null;
				expiresAt: string;
				inEffect: boolean;
				appealableUntil: string;
			}[];
			meta: object;
		}>;
		create: import("@trpc/server").TRPCMutationProcedure<{
			input: {
				penaltyKey: number;
				appealReason: string;
			};
			output: {
				appealKey: number;
				status: "pending" | "approved" | "rejected";
				appealReason: string | null;
				filedAt: string | null;
				resolvedAt: string | null;
				filedBy: {
					accountKey: number;
					studentId: string;
					firstName: string;
					lastName: string;
					creditScore: number;
				};
				resolvedBy: {
					accountKey: number;
					studentId: string;
					firstName: string;
					lastName: string;
					creditScore: number;
				} | null;
				penalty: {
					penaltyKey: number;
					usageKey: number | null;
					reason: string | null;
					creditDeducted: number | null;
					issuedAt: string | null;
					expiresAt: string;
					inEffect: boolean;
				};
				replacementPenalty: {
					penaltyKey: number;
					usageKey: number | null;
					reason: string | null;
					creditDeducted: number | null;
					issuedAt: string | null;
					expiresAt: string;
					inEffect: boolean;
				} | null;
				creditRestored: number;
				inspectorKeys: number[];
			};
			meta: object;
		}>;
		mine: import("@trpc/server").TRPCQueryProcedure<{
			input: {
				page?: number | undefined;
				pageSize?: number | undefined;
				q?: string | undefined;
				sort?: string | undefined;
				order?: "asc" | "desc" | undefined;
				status?: "pending" | "approved" | "rejected" | undefined;
			};
			output: {
				items: {
					appealKey: number;
					status: "pending" | "approved" | "rejected";
					appealReason: string | null;
					filedAt: string | null;
					resolvedAt: string | null;
					filedBy: {
						accountKey: number;
						studentId: string;
						firstName: string;
						lastName: string;
						creditScore: number;
					};
					resolvedBy: {
						accountKey: number;
						studentId: string;
						firstName: string;
						lastName: string;
						creditScore: number;
					} | null;
					penalty: {
						penaltyKey: number;
						usageKey: number | null;
						reason: string | null;
						creditDeducted: number | null;
						issuedAt: string | null;
						expiresAt: string;
						inEffect: boolean;
					};
					replacementPenalty: {
						penaltyKey: number;
						usageKey: number | null;
						reason: string | null;
						creditDeducted: number | null;
						issuedAt: string | null;
						expiresAt: string;
						inEffect: boolean;
					} | null;
					creditRestored: number;
					inspectorKeys: number[];
				}[];
				total: number;
				page: number;
				pageSize: number;
			};
			meta: object;
		}>;
		getById: import("@trpc/server").TRPCQueryProcedure<{
			input: {
				appealKey: number;
			};
			output: {
				appealKey: number;
				status: "pending" | "approved" | "rejected";
				appealReason: string | null;
				filedAt: string | null;
				resolvedAt: string | null;
				filedBy: {
					accountKey: number;
					studentId: string;
					firstName: string;
					lastName: string;
					creditScore: number;
				};
				resolvedBy: {
					accountKey: number;
					studentId: string;
					firstName: string;
					lastName: string;
					creditScore: number;
				} | null;
				penalty: {
					penaltyKey: number;
					usageKey: number | null;
					reason: string | null;
					creditDeducted: number | null;
					issuedAt: string | null;
					expiresAt: string;
					inEffect: boolean;
				};
				replacementPenalty: {
					penaltyKey: number;
					usageKey: number | null;
					reason: string | null;
					creditDeducted: number | null;
					issuedAt: string | null;
					expiresAt: string;
					inEffect: boolean;
				} | null;
				creditRestored: number;
				inspectorKeys: number[];
			};
			meta: object;
		}>;
		list: import("@trpc/server").TRPCQueryProcedure<{
			input: {
				page?: number | undefined;
				pageSize?: number | undefined;
				q?: string | undefined;
				sort?: string | undefined;
				order?: "asc" | "desc" | undefined;
				status?: "pending" | "approved" | "rejected" | undefined;
			};
			output: {
				items: {
					appealKey: number;
					status: "pending" | "approved" | "rejected";
					appealReason: string | null;
					filedAt: string | null;
					resolvedAt: string | null;
					filedBy: {
						accountKey: number;
						studentId: string;
						firstName: string;
						lastName: string;
						creditScore: number;
					};
					resolvedBy: {
						accountKey: number;
						studentId: string;
						firstName: string;
						lastName: string;
						creditScore: number;
					} | null;
					penalty: {
						penaltyKey: number;
						usageKey: number | null;
						reason: string | null;
						creditDeducted: number | null;
						issuedAt: string | null;
						expiresAt: string;
						inEffect: boolean;
					};
					replacementPenalty: {
						penaltyKey: number;
						usageKey: number | null;
						reason: string | null;
						creditDeducted: number | null;
						issuedAt: string | null;
						expiresAt: string;
						inEffect: boolean;
					} | null;
					creditRestored: number;
					inspectorKeys: number[];
				}[];
				total: number;
				page: number;
				pageSize: number;
			};
			meta: object;
		}>;
		decide: import("@trpc/server").TRPCMutationProcedure<{
			input: {
				appealKey: number;
				decision: "approve" | "reject";
				note?: string | undefined;
				reducedCreditDeducted?: number | undefined;
			};
			output: {
				appealKey: number;
				status: "pending" | "approved" | "rejected";
				appealReason: string | null;
				filedAt: string | null;
				resolvedAt: string | null;
				filedBy: {
					accountKey: number;
					studentId: string;
					firstName: string;
					lastName: string;
					creditScore: number;
				};
				resolvedBy: {
					accountKey: number;
					studentId: string;
					firstName: string;
					lastName: string;
					creditScore: number;
				} | null;
				penalty: {
					penaltyKey: number;
					usageKey: number | null;
					reason: string | null;
					creditDeducted: number | null;
					issuedAt: string | null;
					expiresAt: string;
					inEffect: boolean;
				};
				replacementPenalty: {
					penaltyKey: number;
					usageKey: number | null;
					reason: string | null;
					creditDeducted: number | null;
					issuedAt: string | null;
					expiresAt: string;
					inEffect: boolean;
				} | null;
				creditRestored: number;
				inspectorKeys: number[];
			};
			meta: object;
		}>;
	}>>;
	approval: import("@trpc/server").TRPCBuiltRouter<{
		ctx: object;
		meta: object;
		errorShape: import("@trpc/server").TRPCDefaultErrorShape;
		transformer: false;
	}, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
		queue: import("@trpc/server").TRPCQueryProcedure<{
			input: {
				page?: number | undefined;
				pageSize?: number | undefined;
				q?: string | undefined;
				route?: "staff" | "supervisor" | undefined;
				tier?: "T0" | "T1" | "T2" | "T3" | undefined;
			};
			output: {
				items: {
					reservationKey: number;
					requestedAt: string;
					borrower: {
						accountKey: number;
						studentId: string;
						firstName: string;
						lastName: string;
						creditScore: number;
					};
					creditTier: "D0" | "D1" | "D2" | "D3";
					route: "staff" | "supervisor" | "auto";
					resourceKey: number;
					itemName: string | null;
					serialNo: string | null;
					kind: "equipment" | "room";
					tier: "T0" | "T1" | "T2" | "T3" | null;
					startTime: string;
					endTime: string;
					requestedDays: number;
					reason: string | null;
					clashesWith: {
						reservationKey: number;
						borrowerName: string;
						startTime: string;
						endTime: string;
					}[];
				}[];
				total: number;
				page: number;
				pageSize: number;
			};
			meta: object;
		}>;
		counts: import("@trpc/server").TRPCQueryProcedure<{
			input: void;
			output: {
				staff: number;
				supervisor: number;
				overdueToDecide: number;
				autoApprovedToday: number;
				retirement: number;
				asOf: string | null;
			};
			meta: object;
		}>;
		decide: import("@trpc/server").TRPCMutationProcedure<{
			input: {
				reservationKey: number;
				decision: "approve" | "reject";
				reason?: string | undefined;
			};
			output: {
				request: {
					reservationKey: number;
					status: "pending" | "approved" | "preparing" | "ready" | "inUse" | "returned" | "done" | "rejected" | "cancelled";
					resource: {
						resourceKey: number;
						name: string | null;
						serialNo: string | null;
						kind: "equipment" | "room";
						tier: "T0" | "T1" | "T2" | "T3" | null;
						creditWeight: number;
					};
					startTime: string;
					endTime: string;
					reason: string | null;
					decisionNote: string | null;
					requestedAt: string;
					expiresAt: string | null;
					approval: {
						route: "staff" | "supervisor" | "auto";
						status: "Pending" | "Approved" | "Rejected" | "Canceled";
						approvedBy: {
							accountKey: number;
							studentId: string;
							firstName: string;
							lastName: string;
							creditScore: number;
						} | null;
						autoApproved: boolean;
						approvedAt: string | null;
						resolvedAt: string | null;
					};
					usageKey: number | null;
					dueAt: string | null;
					cancellable: boolean;
				};
				cancelled: {
					reservationKey: number;
					borrower: {
						accountKey: number;
						studentId: string;
						firstName: string;
						lastName: string;
						creditScore: number;
					};
					startTime: string;
					endTime: string;
				}[];
			};
			meta: object;
		}>;
		extensionQueue: import("@trpc/server").TRPCQueryProcedure<{
			input: {
				page?: number | undefined;
				pageSize?: number | undefined;
				q?: string | undefined;
				route?: "staff" | "supervisor" | undefined;
				tier?: "T0" | "T1" | "T2" | "T3" | undefined;
			};
			output: {
				items: {
					extensionKey: number;
					usageKey: number;
					borrower: {
						accountKey: number;
						studentId: string;
						firstName: string;
						lastName: string;
						creditScore: number;
					};
					creditTier: "D0" | "D1" | "D2" | "D3";
					route: "staff" | "supervisor" | "auto";
					itemName: string | null;
					serialNo: string | null;
					tier: "T0" | "T1" | "T2" | "T3" | null;
					extendNo: number | null;
					previousDueAt: string;
					requestedDueAt: string;
					requestedAt: string;
					reason: string | null;
					status: "Pending" | "Approved" | "Rejected" | "Canceled";
				}[];
				total: number;
				page: number;
				pageSize: number;
			};
			meta: object;
		}>;
		decideExtension: import("@trpc/server").TRPCMutationProcedure<{
			input: {
				extensionKey: number;
				decision: "approve" | "reject";
				condition?: "Normal" | "MinorDamage" | "MajorDamage" | "Broken" | "Missing" | undefined;
				note?: string | undefined;
			};
			output: {
				extensionKey: number;
				usageKey: number;
				status: "Pending" | "Approved" | "Rejected" | "Canceled";
				route: "staff" | "supervisor" | "auto";
				requiresInspection: boolean;
				autoApproved: boolean;
				extendNo: number | null;
				previousDueAt: string;
				requestedDueAt: string;
				dueAt: string;
				requestedAt: string;
				resolvedAt: string | null;
				itemName: string | null;
				serialNo: string | null;
				tier: "T0" | "T1" | "T2" | "T3" | null;
				extensionsUsed: number;
				extensionsAllowed: number;
			};
			meta: object;
		}>;
		retirementQueue: import("@trpc/server").TRPCQueryProcedure<{
			input: {
				page?: number | undefined;
				pageSize?: number | undefined;
				q?: string | undefined;
			};
			output: {
				items: {
					requestKey: number;
					resourceKey: number;
					kind: "equipment" | "room";
					resourceName: string | null;
					serialNo: string | null;
					reason: string;
					status: "Pending" | "Approved" | "Rejected" | "Canceled";
					requestedBy: {
						accountKey: number;
						userId: string;
						name: string;
					};
					requestedAt: string;
					decidedBy: {
						accountKey: number;
						userId: string;
						name: string;
					} | null;
					decidedAt: string | null;
					decisionNote: string | null;
				}[];
				total: number;
				page: number;
				pageSize: number;
			};
			meta: object;
		}>;
		decideRetirement: import("@trpc/server").TRPCMutationProcedure<{
			input: {
				requestKey: number;
				decision: "approve" | "reject";
				note?: string | undefined;
			};
			output: {
				requestKey: number;
				resourceKey: number;
				kind: "equipment" | "room";
				resourceName: string | null;
				serialNo: string | null;
				reason: string;
				status: "Pending" | "Approved" | "Rejected" | "Canceled";
				requestedBy: {
					accountKey: number;
					userId: string;
					name: string;
				};
				requestedAt: string;
				decidedBy: {
					accountKey: number;
					userId: string;
					name: string;
				} | null;
				decidedAt: string | null;
				decisionNote: string | null;
			};
			meta: object;
		}>;
	}>>;
	auth: import("@trpc/server").TRPCBuiltRouter<{
		ctx: object;
		meta: object;
		errorShape: import("@trpc/server").TRPCDefaultErrorShape;
		transformer: false;
	}, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
		providers: import("@trpc/server").TRPCQueryProcedure<{
			input: void;
			output: {
				google: boolean;
			};
			meta: object;
		}>;
		me: import("@trpc/server").TRPCQueryProcedure<{
			input: void;
			output: {
				id: number;
				studentId: string;
				firstName: string;
				lastName: string;
				email: string;
				role: "borrower" | "staff" | "supervisor" | "admin";
				facultyName: string | null;
				creditScore: number;
				creditTier: "D0" | "D1" | "D2" | "D3";
				maxBorrowDays: number;
				maxExtendTimes: number;
			};
			meta: object;
		}>;
		login: import("@trpc/server").TRPCMutationProcedure<{
			input: {
				username: string;
				password: string;
			};
			output: {
				user: {
					id: number;
					studentId: string;
					firstName: string;
					lastName: string;
					email: string;
					role: "borrower" | "staff" | "supervisor" | "admin";
					facultyName: string | null;
					creditScore: number;
					creditTier: "D0" | "D1" | "D2" | "D3";
					maxBorrowDays: number;
					maxExtendTimes: number;
				};
			};
			meta: object;
		}>;
		logout: import("@trpc/server").TRPCMutationProcedure<{
			input: void;
			output: {
				ok: true;
			};
			meta: object;
		}>;
		logoutAll: import("@trpc/server").TRPCMutationProcedure<{
			input: void;
			output: {
				ok: true;
			};
			meta: object;
		}>;
		requestPasswordReset: import("@trpc/server").TRPCMutationProcedure<{
			input: {
				email: string;
			};
			output: {
				ok: true;
			};
			meta: object;
		}>;
		register: import("@trpc/server").TRPCMutationProcedure<{
			input: {
				email: string;
				studentId: string;
				firstName: string;
				lastName: string;
				password: string;
			};
			output: {
				ok: true;
			};
			meta: object;
		}>;
		verifyEmail: import("@trpc/server").TRPCMutationProcedure<{
			input: {
				token: string;
			};
			output: {
				ok: true;
			};
			meta: object;
		}>;
		resetPasswordWithToken: import("@trpc/server").TRPCMutationProcedure<{
			input: {
				token: string;
				newPassword: string;
			};
			output: {
				ok: true;
			};
			meta: object;
		}>;
		changePassword: import("@trpc/server").TRPCMutationProcedure<{
			input: {
				currentPassword: string;
				newPassword: string;
			};
			output: {
				ok: true;
				otherSessionsRevoked: number;
			};
			meta: object;
		}>;
	}>>;
	credit: import("@trpc/server").TRPCBuiltRouter<{
		ctx: object;
		meta: object;
		errorShape: import("@trpc/server").TRPCDefaultErrorShape;
		transformer: false;
	}, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
		me: import("@trpc/server").TRPCQueryProcedure<{
			input: void;
			output: {
				accountId: number;
				score: number;
				tier: "D0" | "D1" | "D2" | "D3";
				maxBorrowDays: number;
				maxExtendTimes: number;
				activePenalties: {
					id: number;
					reason: string | null;
					usageKey: number | null;
					creditDeducted: number | null;
					issuedAt: string | null;
					expiresAt: string;
					appealed: boolean;
				}[];
				totalDeducted: number;
			};
			meta: object;
		}>;
		getById: import("@trpc/server").TRPCQueryProcedure<{
			input: {
				id: number;
			};
			output: {
				accountId: number;
				score: number;
				tier: "D0" | "D1" | "D2" | "D3";
				maxBorrowDays: number;
				maxExtendTimes: number;
				activePenalties: {
					id: number;
					reason: string | null;
					usageKey: number | null;
					creditDeducted: number | null;
					issuedAt: string | null;
					expiresAt: string;
					appealed: boolean;
				}[];
				totalDeducted: number;
			};
			meta: object;
		}>;
	}>>;
	image: import("@trpc/server").TRPCBuiltRouter<{
		ctx: object;
		meta: object;
		errorShape: import("@trpc/server").TRPCDefaultErrorShape;
		transformer: false;
	}, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
		requestUpload: import("@trpc/server").TRPCMutationProcedure<{
			input: {
				purpose: "room" | "itemType" | "itemUnit" | "inspection";
				contentType: "image/jpeg" | "image/png";
				sizeBytes: number;
			};
			output: {
				uploadUrl: string;
				imageUrl: string;
				previewUrl: string;
				expiresAt: string;
				maxBytes: number;
			};
			meta: object;
		}>;
		requestUsagePhotoUpload: import("@trpc/server").TRPCMutationProcedure<{
			input: {
				usageKey: number;
				contentType: "image/jpeg" | "image/png";
				sizeBytes: number;
			};
			output: {
				uploadUrl: string;
				imageUrl: string;
				previewUrl: string;
				expiresAt: string;
				maxBytes: number;
			};
			meta: object;
		}>;
		attachUsagePhotos: import("@trpc/server").TRPCMutationProcedure<{
			input: {
				usageKey: number;
				stage: "before" | "after" | "evidence";
				imageUrls: string[];
			};
			output: {
				before: {
					imageKey: number;
					imageUrl: string;
					stage: "inspection" | "before" | "after" | "evidence";
					submittedBy: number;
					submittedAt: string | null;
				}[];
				after: {
					imageKey: number;
					imageUrl: string;
					stage: "inspection" | "before" | "after" | "evidence";
					submittedBy: number;
					submittedAt: string | null;
				}[];
				inspection: {
					imageKey: number;
					imageUrl: string;
					stage: "inspection" | "before" | "after" | "evidence";
					submittedBy: number;
					submittedAt: string | null;
				}[];
				evidence: {
					imageKey: number;
					imageUrl: string;
					stage: "inspection" | "before" | "after" | "evidence";
					submittedBy: number;
					submittedAt: string | null;
				}[];
			};
			meta: object;
		}>;
		usagePhotos: import("@trpc/server").TRPCQueryProcedure<{
			input: {
				usageKey: number;
			};
			output: {
				before: {
					imageKey: number;
					imageUrl: string;
					stage: "inspection" | "before" | "after" | "evidence";
					submittedBy: number;
					submittedAt: string | null;
				}[];
				after: {
					imageKey: number;
					imageUrl: string;
					stage: "inspection" | "before" | "after" | "evidence";
					submittedBy: number;
					submittedAt: string | null;
				}[];
				inspection: {
					imageKey: number;
					imageUrl: string;
					stage: "inspection" | "before" | "after" | "evidence";
					submittedBy: number;
					submittedAt: string | null;
				}[];
				evidence: {
					imageKey: number;
					imageUrl: string;
					stage: "inspection" | "before" | "after" | "evidence";
					submittedBy: number;
					submittedAt: string | null;
				}[];
			};
			meta: object;
		}>;
		detachUsagePhoto: import("@trpc/server").TRPCMutationProcedure<{
			input: {
				imageKey: number;
			};
			output: {
				before: {
					imageKey: number;
					imageUrl: string;
					stage: "inspection" | "before" | "after" | "evidence";
					submittedBy: number;
					submittedAt: string | null;
				}[];
				after: {
					imageKey: number;
					imageUrl: string;
					stage: "inspection" | "before" | "after" | "evidence";
					submittedBy: number;
					submittedAt: string | null;
				}[];
				inspection: {
					imageKey: number;
					imageUrl: string;
					stage: "inspection" | "before" | "after" | "evidence";
					submittedBy: number;
					submittedAt: string | null;
				}[];
				evidence: {
					imageKey: number;
					imageUrl: string;
					stage: "inspection" | "before" | "after" | "evidence";
					submittedBy: number;
					submittedAt: string | null;
				}[];
			};
			meta: object;
		}>;
	}>>;
	inspection: import("@trpc/server").TRPCBuiltRouter<{
		ctx: object;
		meta: object;
		errorShape: import("@trpc/server").TRPCDefaultErrorShape;
		transformer: false;
	}, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
		list: import("@trpc/server").TRPCQueryProcedure<{
			input: {
				page?: number | undefined;
				pageSize?: number | undefined;
				q?: string | undefined;
				sort?: string | undefined;
				order?: "asc" | "desc" | undefined;
				tier?: "T0" | "T1" | "T2" | "T3" | undefined;
			};
			output: {
				items: {
					usageKey: number;
					borrowerName: string;
					borrowerStudentId: string;
					itemName: string | null;
					serialNo: string | null;
					resourceKey: number;
					tier: "T0" | "T1" | "T2" | "T3" | null;
					checkoutCondition: "Normal" | "MinorDamage" | "MajorDamage" | "Broken" | "Missing";
					returnedAt: string | null;
					overdueDays: number;
					beforeImageCount: number;
					afterImageCount: number;
				}[];
				total: number;
				page: number;
				pageSize: number;
			};
			meta: object;
		}>;
		getById: import("@trpc/server").TRPCQueryProcedure<{
			input: {
				usageKey: number;
			};
			output: {
				usageKey: number;
				resourceKey: number;
				itemName: string | null;
				serialNo: string | null;
				tier: "T0" | "T1" | "T2" | "T3" | null;
				creditWeight: number;
				borrowerAccountKey: number;
				borrowerName: string;
				borrowerStudentId: string;
				borrowerCreditScore: number;
				checkoutCondition: "Normal" | "MinorDamage" | "MajorDamage" | "Broken" | "Missing";
				checkoutConditionNote: string | null;
				checkoutAt: string;
				dueAt: string;
				returnedAt: string | null;
				overdueDays: number;
				beforeImages: {
					imageKey: number;
					url: string;
					submittedAt: string | null;
				}[];
				afterImages: {
					imageKey: number;
					url: string;
					submittedAt: string | null;
				}[];
				unitHistory: {
					conditionKey: number;
					condition: "Normal" | "MinorDamage" | "MajorDamage" | "Broken" | "Missing";
					note: string | null;
					loggedAt: string | null;
				}[];
				existingInspectionKey: number | null;
			};
			meta: object;
		}>;
		create: import("@trpc/server").TRPCMutationProcedure<{
			input: {
				usageKey: number;
				level: "B0" | "B1" | "B2" | "B3";
				note?: string | undefined;
				imageUrls?: string[] | undefined;
			};
			output: {
				inspectionKey: number;
				usageKey: number;
				resourceKey: number;
				inspectorAccountKey: number;
				level: "B0" | "B1" | "B2" | "B3" | null;
				condition: "Normal" | "MinorDamage" | "MajorDamage" | "Broken" | "Missing";
				note: string | null;
				inspectedAt: string | null;
				penalty: {
					penaltyKey: number;
					creditDeducted: number;
					expiresAt: string;
				} | null;
				returnedToPool: boolean;
			};
			meta: object;
		}>;
		listForResource: import("@trpc/server").TRPCQueryProcedure<{
			input: {
				resourceKey: number;
				limit?: number | undefined;
			};
			output: {
				inspectionKey: number;
				usageKey: number;
				condition: "Normal" | "MinorDamage" | "MajorDamage" | "Broken" | "Missing";
				level: "B0" | "B1" | "B2" | "B3" | null;
				note: string | null;
				inspectedAt: string | null;
				inspectorName: string;
				borrowerStudentId: string;
			}[];
			meta: object;
		}>;
		listRoomRounds: import("@trpc/server").TRPCQueryProcedure<{
			input: {
				page?: number | undefined;
				pageSize?: number | undefined;
				q?: string | undefined;
				sort?: string | undefined;
				order?: "asc" | "desc" | undefined;
				openOnly?: boolean | undefined;
			};
			output: {
				items: {
					roundKey: number;
					resourceKey: number;
					roomName: string | null;
					location: string | null;
					openedAt: string;
					dueAt: string;
					closedAt: string | null;
					overdue: boolean;
					condition: "Normal" | "MinorDamage" | "MajorDamage" | "Broken" | "Missing" | null;
					note: string | null;
					stillBookable: boolean;
				}[];
				total: number;
				page: number;
				pageSize: number;
			};
			meta: object;
		}>;
		recordRoomCheck: import("@trpc/server").TRPCMutationProcedure<{
			input: {
				resourceKey: number;
				condition?: "Normal" | "MinorDamage" | "MajorDamage" | "Broken" | "Missing" | undefined;
				note?: string | undefined;
			};
			output: {
				resourceKey: number;
				conditionKey: number;
				condition: "Normal" | "MinorDamage" | "MajorDamage" | "Broken" | "Missing";
				note: string | null;
				checkedAt: string;
				stillBookable: boolean;
			};
			meta: object;
		}>;
		listRepairs: import("@trpc/server").TRPCQueryProcedure<{
			input: {
				page?: number | undefined;
				pageSize?: number | undefined;
				q?: string | undefined;
				sort?: string | undefined;
				order?: "asc" | "desc" | undefined;
				openOnly?: boolean | undefined;
			};
			output: {
				items: {
					repairKey: number;
					resourceKey: number;
					itemName: string | null;
					serialNo: string | null;
					repairedByName: string;
					conditionBefore: "Normal" | "MinorDamage" | "MajorDamage" | "Broken" | "Missing";
					conditionAfter: "Normal" | "MinorDamage" | "MajorDamage" | "Broken" | "Missing" | null;
					beganAt: string;
					finishedAt: string | null;
				}[];
				total: number;
				page: number;
				pageSize: number;
			};
			meta: object;
		}>;
		startRepair: import("@trpc/server").TRPCMutationProcedure<{
			input: {
				resourceKey: number;
				note?: string | undefined;
			};
			output: {
				repairKey: number;
				resourceKey: number;
				itemName: string | null;
				serialNo: string | null;
				repairedByName: string;
				conditionBefore: "Normal" | "MinorDamage" | "MajorDamage" | "Broken" | "Missing";
				conditionAfter: "Normal" | "MinorDamage" | "MajorDamage" | "Broken" | "Missing" | null;
				beganAt: string;
				finishedAt: string | null;
			};
			meta: object;
		}>;
		finishRepair: import("@trpc/server").TRPCMutationProcedure<{
			input: {
				repairKey: number;
				condition?: "Normal" | "MinorDamage" | "MajorDamage" | "Broken" | "Missing" | undefined;
				note?: string | undefined;
			};
			output: {
				repairKey: number;
				resourceKey: number;
				itemName: string | null;
				serialNo: string | null;
				repairedByName: string;
				conditionBefore: "Normal" | "MinorDamage" | "MajorDamage" | "Broken" | "Missing";
				conditionAfter: "Normal" | "MinorDamage" | "MajorDamage" | "Broken" | "Missing" | null;
				beganAt: string;
				finishedAt: string | null;
			};
			meta: object;
		}>;
	}>>;
	item: import("@trpc/server").TRPCBuiltRouter<{
		ctx: object;
		meta: object;
		errorShape: import("@trpc/server").TRPCDefaultErrorShape;
		transformer: false;
	}, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
		list: import("@trpc/server").TRPCQueryProcedure<{
			input: {
				page?: number | undefined;
				pageSize?: number | undefined;
				q?: string | undefined;
				sort?: "name" | "creditWeight" | "available" | "popular" | undefined;
				tier?: "T0" | "T1" | "T2" | "T3" | undefined;
				ownerGroupKey?: number | undefined;
				availableOnly?: boolean | undefined;
				cursor?: string | undefined;
				startTime?: string | undefined;
				endTime?: string | undefined;
			};
			output: {
				items: {
					id: number;
					name: string;
					description: string | null;
					imageUrl: string | null;
					tier: "T0" | "T1" | "T2" | "T3" | null;
					creditWeight: number;
					totalUnits: number;
					availableUnits: number;
					stockStatus: "ok" | "queue" | "maintenance";
					nextAvailableAt: string | null;
					prepDays: number;
					allowBorrow: boolean;
					eligible: boolean;
					owner: {
						id: number;
						name: string | null;
						type: "Club" | "Faculty";
					} | null;
				}[];
				total: number;
				page: number;
				pageSize: number;
				nextCursor: string | null;
			};
			meta: object;
		}>;
		getById: import("@trpc/server").TRPCQueryProcedure<{
			input: {
				id: number;
				startTime?: string | undefined;
				endTime?: string | undefined;
			};
			output: {
				id: number;
				name: string;
				description: string | null;
				imageUrl: string | null;
				tier: "T0" | "T1" | "T2" | "T3" | null;
				creditWeight: number;
				totalUnits: number;
				availableUnits: number;
				stockStatus: "ok" | "queue" | "maintenance";
				nextAvailableAt: string | null;
				prepDays: number;
				allowBorrow: boolean;
				eligible: boolean;
				owner: {
					id: number;
					name: string | null;
					type: "Club" | "Faculty";
				} | null;
				units: {
					id: number;
					resourceKey: number;
					assetTag: string;
					imageUrl: string | null;
					status: "Missing" | "InStorage" | "Lended" | "Retired";
					allowBorrow: boolean;
					condition: "Normal" | "MinorDamage" | "MajorDamage" | "Broken" | "Missing" | null;
					dueAt: string | null;
					nextAvailableAt: string | null;
					availableForWindow?: boolean | undefined;
				}[];
			};
			meta: object;
		}>;
		getAvailability: import("@trpc/server").TRPCQueryProcedure<{
			input: {
				id: number;
			};
			output: {
				availableUnits: number;
				totalUnits: number;
				nextAvailableAt: string | null;
			};
			meta: object;
		}>;
		listUnits: import("@trpc/server").TRPCQueryProcedure<{
			input: {
				id: number;
				startTime?: string | undefined;
				endTime?: string | undefined;
			};
			output: {
				id: number;
				resourceKey: number;
				assetTag: string;
				imageUrl: string | null;
				status: "Missing" | "InStorage" | "Lended" | "Retired";
				allowBorrow: boolean;
				condition: "Normal" | "MinorDamage" | "MajorDamage" | "Broken" | "Missing" | null;
				dueAt: string | null;
				nextAvailableAt: string | null;
				availableForWindow?: boolean | undefined;
			}[];
			meta: object;
		}>;
		listRooms: import("@trpc/server").TRPCQueryProcedure<{
			input: {
				page?: number | undefined;
				pageSize?: number | undefined;
				q?: string | undefined;
				sort?: "name" | "creditWeight" | "location" | undefined;
				ownerGroupKey?: number | undefined;
				bookableOnly?: boolean | undefined;
			};
			output: {
				items: {
					id: number;
					name: string;
					description: string | null;
					location: string | null;
					imageUrl: string | null;
					capacity: number | null;
					tier: "T0" | "T1" | "T2" | "T3" | null;
					creditWeight: number;
					status: "Missing" | "InStorage" | "Lended" | "Retired";
					allowBorrow: boolean;
					bookable: boolean;
					owner: {
						id: number;
						name: string | null;
						type: "Club" | "Faculty";
					} | null;
				}[];
				total: number;
				page: number;
				pageSize: number;
			};
			meta: object;
		}>;
		roomAvailability: import("@trpc/server").TRPCQueryProcedure<{
			input: {
				roomKey: number;
				date: string;
			};
			output: {
				roomKey: number;
				date: string;
				slots: {
					index: number;
					start: string;
					end: string;
					startTime: string;
					endTime: string;
					available: boolean;
				}[];
				maxSlotsPerBooking: number;
				slotMinutes: number;
			};
			meta: object;
		}>;
		getRoomById: import("@trpc/server").TRPCQueryProcedure<{
			input: {
				id: number;
			};
			output: {
				id: number;
				name: string;
				description: string | null;
				location: string | null;
				imageUrl: string | null;
				capacity: number | null;
				tier: "T0" | "T1" | "T2" | "T3" | null;
				creditWeight: number;
				status: "Missing" | "InStorage" | "Lended" | "Retired";
				allowBorrow: boolean;
				bookable: boolean;
				owner: {
					id: number;
					name: string | null;
					type: "Club" | "Faculty";
				} | null;
			};
			meta: object;
		}>;
		listManaged: import("@trpc/server").TRPCQueryProcedure<{
			input: {
				page?: number | undefined;
				pageSize?: number | undefined;
				q?: string | undefined;
				sort?: string | undefined;
				order?: "asc" | "desc" | undefined;
				tier?: "T0" | "T1" | "T2" | "T3" | undefined;
				availableOnly?: boolean | undefined;
			};
			output: {
				items: {
					id: number;
					name: string | null;
					description: string | null;
					imageUrl: string | null;
					creditWeight: number;
					tiers: ("T0" | "T1" | "T2" | "T3")[];
					totalUnits: number;
					availableUnits: number;
					price: number | null;
					suggestedTier: "T0" | "T1" | "T2" | "T3" | null;
				}[];
				total: number;
				page: number;
				pageSize: number;
			};
			meta: object;
		}>;
		getManagedById: import("@trpc/server").TRPCQueryProcedure<{
			input: {
				itemKey: number;
			};
			output: {
				id: number;
				name: string | null;
				description: string | null;
				imageUrl: string | null;
				creditWeight: number;
				tiers: ("T0" | "T1" | "T2" | "T3")[];
				totalUnits: number;
				availableUnits: number;
				price: number | null;
				suggestedTier: "T0" | "T1" | "T2" | "T3" | null;
				units: {
					resourceKey: number;
					indivKey: number;
					itemKey: number;
					serialNo: string;
					imageUrl: string | null;
					tier: "T0" | "T1" | "T2" | "T3" | null;
					status: "Missing" | "InStorage" | "Lended" | "Retired";
					lendable: boolean;
					prepDays: number;
					condition: "Normal" | "MinorDamage" | "MajorDamage" | "Broken" | "Missing" | null;
					conditionNote: string | null;
					conditionLoggedAt: string | null;
					managementGroup: {
						id: number;
						name: string | null;
						type: "Club" | "Faculty";
					};
					currentDueAt: string | null;
				}[];
			};
			meta: object;
		}>;
		createType: import("@trpc/server").TRPCMutationProcedure<{
			input: {
				name: string;
				creditWeight: number;
				description?: string | undefined;
				imageUrl?: string | undefined;
				price?: number | undefined;
			};
			output: {
				id: number;
				name: string | null;
				description: string | null;
				imageUrl: string | null;
				creditWeight: number;
				tiers: ("T0" | "T1" | "T2" | "T3")[];
				totalUnits: number;
				availableUnits: number;
				price: number | null;
				suggestedTier: "T0" | "T1" | "T2" | "T3" | null;
				units: {
					resourceKey: number;
					indivKey: number;
					itemKey: number;
					serialNo: string;
					imageUrl: string | null;
					tier: "T0" | "T1" | "T2" | "T3" | null;
					status: "Missing" | "InStorage" | "Lended" | "Retired";
					lendable: boolean;
					prepDays: number;
					condition: "Normal" | "MinorDamage" | "MajorDamage" | "Broken" | "Missing" | null;
					conditionNote: string | null;
					conditionLoggedAt: string | null;
					managementGroup: {
						id: number;
						name: string | null;
						type: "Club" | "Faculty";
					};
					currentDueAt: string | null;
				}[];
			};
			meta: object;
		}>;
		updateType: import("@trpc/server").TRPCMutationProcedure<{
			input: {
				itemKey: number;
				name?: string | undefined;
				description?: string | undefined;
				imageUrl?: string | undefined;
				creditWeight?: number | undefined;
				price?: number | null | undefined;
			};
			output: {
				id: number;
				name: string | null;
				description: string | null;
				imageUrl: string | null;
				creditWeight: number;
				tiers: ("T0" | "T1" | "T2" | "T3")[];
				totalUnits: number;
				availableUnits: number;
				price: number | null;
				suggestedTier: "T0" | "T1" | "T2" | "T3" | null;
				units: {
					resourceKey: number;
					indivKey: number;
					itemKey: number;
					serialNo: string;
					imageUrl: string | null;
					tier: "T0" | "T1" | "T2" | "T3" | null;
					status: "Missing" | "InStorage" | "Lended" | "Retired";
					lendable: boolean;
					prepDays: number;
					condition: "Normal" | "MinorDamage" | "MajorDamage" | "Broken" | "Missing" | null;
					conditionNote: string | null;
					conditionLoggedAt: string | null;
					managementGroup: {
						id: number;
						name: string | null;
						type: "Club" | "Faculty";
					};
					currentDueAt: string | null;
				}[];
			};
			meta: object;
		}>;
		listManagedUnits: import("@trpc/server").TRPCQueryProcedure<{
			input: {
				itemKey: number;
				status?: "Missing" | "InStorage" | "Lended" | "Retired" | undefined;
				lendable?: boolean | undefined;
			};
			output: {
				resourceKey: number;
				indivKey: number;
				itemKey: number;
				serialNo: string;
				imageUrl: string | null;
				tier: "T0" | "T1" | "T2" | "T3" | null;
				status: "Missing" | "InStorage" | "Lended" | "Retired";
				lendable: boolean;
				prepDays: number;
				condition: "Normal" | "MinorDamage" | "MajorDamage" | "Broken" | "Missing" | null;
				conditionNote: string | null;
				conditionLoggedAt: string | null;
				managementGroup: {
					id: number;
					name: string | null;
					type: "Club" | "Faculty";
				};
				currentDueAt: string | null;
			}[];
			meta: object;
		}>;
		createUnit: import("@trpc/server").TRPCMutationProcedure<{
			input: {
				itemKey: number;
				manageGroupKey: number;
				tier: "T0" | "T1" | "T2" | "T3";
				serialNo?: string | undefined;
				imageUrl?: string | undefined;
				prepDays?: number | undefined;
				lendable?: boolean | undefined;
				quantity?: number | undefined;
			};
			output: {
				resourceKey: number;
				indivKey: number;
				itemKey: number;
				serialNo: string;
				imageUrl: string | null;
				tier: "T0" | "T1" | "T2" | "T3" | null;
				status: "Missing" | "InStorage" | "Lended" | "Retired";
				lendable: boolean;
				prepDays: number;
				condition: "Normal" | "MinorDamage" | "MajorDamage" | "Broken" | "Missing" | null;
				conditionNote: string | null;
				conditionLoggedAt: string | null;
				managementGroup: {
					id: number;
					name: string | null;
					type: "Club" | "Faculty";
				};
				currentDueAt: string | null;
			}[];
			meta: object;
		}>;
		updateUnit: import("@trpc/server").TRPCMutationProcedure<{
			input: {
				resourceKey: number;
				serialNo?: string | undefined;
				imageUrl?: string | undefined;
				tier?: "T0" | "T1" | "T2" | "T3" | undefined;
				prepDays?: number | undefined;
			};
			output: {
				resourceKey: number;
				indivKey: number;
				itemKey: number;
				serialNo: string;
				imageUrl: string | null;
				tier: "T0" | "T1" | "T2" | "T3" | null;
				status: "Missing" | "InStorage" | "Lended" | "Retired";
				lendable: boolean;
				prepDays: number;
				condition: "Normal" | "MinorDamage" | "MajorDamage" | "Broken" | "Missing" | null;
				conditionNote: string | null;
				conditionLoggedAt: string | null;
				managementGroup: {
					id: number;
					name: string | null;
					type: "Club" | "Faculty";
				};
				currentDueAt: string | null;
			};
			meta: object;
		}>;
		setUnitLendable: import("@trpc/server").TRPCMutationProcedure<{
			input: {
				resourceKey: number;
				lendable: boolean;
				reason?: string | undefined;
			};
			output: {
				resourceKey: number;
				indivKey: number;
				itemKey: number;
				serialNo: string;
				imageUrl: string | null;
				tier: "T0" | "T1" | "T2" | "T3" | null;
				status: "Missing" | "InStorage" | "Lended" | "Retired";
				lendable: boolean;
				prepDays: number;
				condition: "Normal" | "MinorDamage" | "MajorDamage" | "Broken" | "Missing" | null;
				conditionNote: string | null;
				conditionLoggedAt: string | null;
				managementGroup: {
					id: number;
					name: string | null;
					type: "Club" | "Faculty";
				};
				currentDueAt: string | null;
			};
			meta: object;
		}>;
		setUnitCondition: import("@trpc/server").TRPCMutationProcedure<{
			input: {
				resourceKey: number;
				condition: "Normal" | "MinorDamage" | "MajorDamage" | "Broken" | "Missing";
				note?: string | undefined;
			};
			output: {
				resourceKey: number;
				indivKey: number;
				itemKey: number;
				serialNo: string;
				imageUrl: string | null;
				tier: "T0" | "T1" | "T2" | "T3" | null;
				status: "Missing" | "InStorage" | "Lended" | "Retired";
				lendable: boolean;
				prepDays: number;
				condition: "Normal" | "MinorDamage" | "MajorDamage" | "Broken" | "Missing" | null;
				conditionNote: string | null;
				conditionLoggedAt: string | null;
				managementGroup: {
					id: number;
					name: string | null;
					type: "Club" | "Faculty";
				};
				currentDueAt: string | null;
			};
			meta: object;
		}>;
		listManagedRooms: import("@trpc/server").TRPCQueryProcedure<{
			input: {
				page?: number | undefined;
				pageSize?: number | undefined;
				q?: string | undefined;
				sort?: string | undefined;
				order?: "asc" | "desc" | undefined;
				lendable?: boolean | undefined;
			};
			output: {
				items: {
					openMinutes: number;
					closeMinutes: number;
					breakStartMinutes: number | null;
					breakEndMinutes: number | null;
					resourceKey: number;
					roomKey: number;
					name: string | null;
					description: string | null;
					location: string | null;
					imageUrl: string | null;
					creditWeight: number;
					capacity: number | null;
					tier: "T0" | "T1" | "T2" | "T3" | null;
					status: "Missing" | "InStorage" | "Lended" | "Retired";
					lendable: boolean;
					condition: "Normal" | "MinorDamage" | "MajorDamage" | "Broken" | "Missing" | null;
					managementGroup: {
						id: number;
						name: string | null;
						type: "Club" | "Faculty";
					};
				}[];
				total: number;
				page: number;
				pageSize: number;
			};
			meta: object;
		}>;
		createRoom: import("@trpc/server").TRPCMutationProcedure<{
			input: {
				manageGroupKey: number;
				name: string;
				description?: string | undefined;
				location?: string | undefined;
				imageUrl?: string | undefined;
				creditWeight?: number | undefined;
				capacity?: number | undefined;
				lendable?: boolean | undefined;
				openMinutes?: number | undefined;
				closeMinutes?: number | undefined;
				breakStartMinutes?: number | null | undefined;
				breakEndMinutes?: number | null | undefined;
			};
			output: {
				openMinutes: number;
				closeMinutes: number;
				breakStartMinutes: number | null;
				breakEndMinutes: number | null;
				resourceKey: number;
				roomKey: number;
				name: string | null;
				description: string | null;
				location: string | null;
				imageUrl: string | null;
				creditWeight: number;
				capacity: number | null;
				tier: "T0" | "T1" | "T2" | "T3" | null;
				status: "Missing" | "InStorage" | "Lended" | "Retired";
				lendable: boolean;
				condition: "Normal" | "MinorDamage" | "MajorDamage" | "Broken" | "Missing" | null;
				managementGroup: {
					id: number;
					name: string | null;
					type: "Club" | "Faculty";
				};
			};
			meta: object;
		}>;
		updateRoom: import("@trpc/server").TRPCMutationProcedure<{
			input: {
				resourceKey: number;
				name?: string | undefined;
				description?: string | undefined;
				location?: string | undefined;
				imageUrl?: string | undefined;
				creditWeight?: number | undefined;
				openMinutes?: number | undefined;
				closeMinutes?: number | undefined;
				breakStartMinutes?: number | null | undefined;
				breakEndMinutes?: number | null | undefined;
				capacity?: number | null | undefined;
			};
			output: {
				openMinutes: number;
				closeMinutes: number;
				breakStartMinutes: number | null;
				breakEndMinutes: number | null;
				resourceKey: number;
				roomKey: number;
				name: string | null;
				description: string | null;
				location: string | null;
				imageUrl: string | null;
				creditWeight: number;
				capacity: number | null;
				tier: "T0" | "T1" | "T2" | "T3" | null;
				status: "Missing" | "InStorage" | "Lended" | "Retired";
				lendable: boolean;
				condition: "Normal" | "MinorDamage" | "MajorDamage" | "Broken" | "Missing" | null;
				managementGroup: {
					id: number;
					name: string | null;
					type: "Club" | "Faculty";
				};
			};
			meta: object;
		}>;
		listEligibility: import("@trpc/server").TRPCQueryProcedure<{
			input: {
				itemKey: number;
			} | {
				roomKey: number;
			};
			output: {
				groupKey: number;
				groupName: string | null;
				authorityRoleKey: number;
				authorityRoleName: string;
				appliesToUnits: number;
			}[];
			meta: object;
		}>;
		setEligibility: import("@trpc/server").TRPCMutationProcedure<{
			input: {
				itemKey: number;
				rules: {
					groupKey: number;
					authorityRoleKey: number;
				}[];
			} | {
				roomKey: number;
				rules: {
					groupKey: number;
					authorityRoleKey: number;
				}[];
			};
			output: {
				groupKey: number;
				groupName: string | null;
				authorityRoleKey: number;
				authorityRoleName: string;
				appliesToUnits: number;
			}[];
			meta: object;
		}>;
		listTiers: import("@trpc/server").TRPCQueryProcedure<{
			input: void;
			output: {
				borrowRuleKey: number;
				tier: "T0" | "T1" | "T2" | "T3";
				name: string | null;
			}[];
			meta: object;
		}>;
		listManagementGroups: import("@trpc/server").TRPCQueryProcedure<{
			input: void;
			output: {
				id: number;
				name: string | null;
				type: "Club" | "Faculty";
			}[];
			meta: object;
		}>;
		listAuthorityRoles: import("@trpc/server").TRPCQueryProcedure<{
			input: void;
			output: {
				authorityRoleKey: number;
				name: string;
				level: number | null;
			}[];
			meta: object;
		}>;
		deleteType: import("@trpc/server").TRPCMutationProcedure<{
			input: {
				itemKey: number;
			};
			output: {
				itemKey: number;
			};
			meta: object;
		}>;
		deleteUnit: import("@trpc/server").TRPCMutationProcedure<{
			input: {
				resourceKey: number;
			};
			output: {
				resourceKey: number;
			};
			meta: object;
		}>;
		deleteRoom: import("@trpc/server").TRPCMutationProcedure<{
			input: {
				resourceKey: number;
			};
			output: {
				resourceKey: number;
			};
			meta: object;
		}>;
		requestRetirement: import("@trpc/server").TRPCMutationProcedure<{
			input: {
				resourceKey: number;
				reason: string;
			};
			output: {
				requestKey: number;
				resourceKey: number;
				kind: "equipment" | "room";
				resourceName: string | null;
				serialNo: string | null;
				reason: string;
				status: "Pending" | "Approved" | "Rejected" | "Canceled";
				requestedBy: {
					accountKey: number;
					userId: string;
					name: string;
				};
				requestedAt: string;
				decidedBy: {
					accountKey: number;
					userId: string;
					name: string;
				} | null;
				decidedAt: string | null;
				decisionNote: string | null;
			};
			meta: object;
		}>;
		cancelRetirement: import("@trpc/server").TRPCMutationProcedure<{
			input: {
				requestKey: number;
			};
			output: {
				requestKey: number;
				resourceKey: number;
				kind: "equipment" | "room";
				resourceName: string | null;
				serialNo: string | null;
				reason: string;
				status: "Pending" | "Approved" | "Rejected" | "Canceled";
				requestedBy: {
					accountKey: number;
					userId: string;
					name: string;
				};
				requestedAt: string;
				decidedBy: {
					accountKey: number;
					userId: string;
					name: string;
				} | null;
				decidedAt: string | null;
				decisionNote: string | null;
			};
			meta: object;
		}>;
	}>>;
	loan: import("@trpc/server").TRPCBuiltRouter<{
		ctx: object;
		meta: object;
		errorShape: import("@trpc/server").TRPCDefaultErrorShape;
		transformer: false;
	}, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
		create: import("@trpc/server").TRPCMutationProcedure<{
			input: {
				startTime: string;
				endTime: string;
				lines: {
					resourceKey: number;
					reason?: string | undefined;
				}[];
			};
			output: {
				created: {
					reservationKey: number;
					status: "pending" | "approved" | "preparing" | "ready" | "inUse" | "returned" | "done" | "rejected" | "cancelled";
					resource: {
						resourceKey: number;
						name: string | null;
						serialNo: string | null;
						kind: "equipment" | "room";
						tier: "T0" | "T1" | "T2" | "T3" | null;
						creditWeight: number;
					};
					startTime: string;
					endTime: string;
					reason: string | null;
					decisionNote: string | null;
					requestedAt: string;
					expiresAt: string | null;
					approval: {
						route: "staff" | "supervisor" | "auto";
						status: "Pending" | "Approved" | "Rejected" | "Canceled";
						approvedBy: {
							accountKey: number;
							studentId: string;
							firstName: string;
							lastName: string;
							creditScore: number;
						} | null;
						autoApproved: boolean;
						approvedAt: string | null;
						resolvedAt: string | null;
					};
					usageKey: number | null;
					dueAt: string | null;
					cancellable: boolean;
				}[];
				rejected: {
					resourceKey: number;
					code: string;
					detail: Record<string, unknown> | null;
				}[];
			};
			meta: object;
		}>;
		createRoomBooking: import("@trpc/server").TRPCMutationProcedure<{
			input: {
				roomKey: number;
				date: string;
				slots: number[];
				reason?: string | undefined;
			};
			output: {
				created: {
					reservationKey: number;
					status: "pending" | "approved" | "preparing" | "ready" | "inUse" | "returned" | "done" | "rejected" | "cancelled";
					resource: {
						resourceKey: number;
						name: string | null;
						serialNo: string | null;
						kind: "equipment" | "room";
						tier: "T0" | "T1" | "T2" | "T3" | null;
						creditWeight: number;
					};
					startTime: string;
					endTime: string;
					reason: string | null;
					decisionNote: string | null;
					requestedAt: string;
					expiresAt: string | null;
					approval: {
						route: "staff" | "supervisor" | "auto";
						status: "Pending" | "Approved" | "Rejected" | "Canceled";
						approvedBy: {
							accountKey: number;
							studentId: string;
							firstName: string;
							lastName: string;
							creditScore: number;
						} | null;
						autoApproved: boolean;
						approvedAt: string | null;
						resolvedAt: string | null;
					};
					usageKey: number | null;
					dueAt: string | null;
					cancellable: boolean;
				}[];
				rejected: {
					resourceKey: number;
					code: string;
					detail: Record<string, unknown> | null;
				}[];
			};
			meta: object;
		}>;
		list: import("@trpc/server").TRPCQueryProcedure<{
			input: {
				page?: number | undefined;
				pageSize?: number | undefined;
				q?: string | undefined;
				tab?: "active" | "using" | "history" | undefined;
			};
			output: {
				items: {
					reservationKey: number;
					status: "pending" | "approved" | "preparing" | "ready" | "inUse" | "returned" | "done" | "rejected" | "cancelled";
					resource: {
						resourceKey: number;
						name: string | null;
						serialNo: string | null;
						kind: "equipment" | "room";
						tier: "T0" | "T1" | "T2" | "T3" | null;
						creditWeight: number;
					};
					startTime: string;
					endTime: string;
					reason: string | null;
					decisionNote: string | null;
					requestedAt: string;
					expiresAt: string | null;
					approval: {
						route: "staff" | "supervisor" | "auto";
						status: "Pending" | "Approved" | "Rejected" | "Canceled";
						approvedBy: {
							accountKey: number;
							studentId: string;
							firstName: string;
							lastName: string;
							creditScore: number;
						} | null;
						autoApproved: boolean;
						approvedAt: string | null;
						resolvedAt: string | null;
					};
					usageKey: number | null;
					dueAt: string | null;
					cancellable: boolean;
				}[];
				total: number;
				page: number;
				pageSize: number;
			};
			meta: object;
		}>;
		getById: import("@trpc/server").TRPCQueryProcedure<{
			input: {
				reservationKey: number;
			};
			output: {
				reservationKey: number;
				status: "pending" | "approved" | "preparing" | "ready" | "inUse" | "returned" | "done" | "rejected" | "cancelled";
				resource: {
					resourceKey: number;
					name: string | null;
					serialNo: string | null;
					kind: "equipment" | "room";
					tier: "T0" | "T1" | "T2" | "T3" | null;
					creditWeight: number;
				};
				startTime: string;
				endTime: string;
				reason: string | null;
				decisionNote: string | null;
				requestedAt: string;
				expiresAt: string | null;
				approval: {
					route: "staff" | "supervisor" | "auto";
					status: "Pending" | "Approved" | "Rejected" | "Canceled";
					approvedBy: {
						accountKey: number;
						studentId: string;
						firstName: string;
						lastName: string;
						creditScore: number;
					} | null;
					autoApproved: boolean;
					approvedAt: string | null;
					resolvedAt: string | null;
				};
				usageKey: number | null;
				dueAt: string | null;
				cancellable: boolean;
			};
			meta: object;
		}>;
		cancel: import("@trpc/server").TRPCMutationProcedure<{
			input: {
				reservationKey: number;
				reason?: string | undefined;
			};
			output: {
				reservationKey: number;
				status: "pending" | "approved" | "preparing" | "ready" | "inUse" | "returned" | "done" | "rejected" | "cancelled";
				resource: {
					resourceKey: number;
					name: string | null;
					serialNo: string | null;
					kind: "equipment" | "room";
					tier: "T0" | "T1" | "T2" | "T3" | null;
					creditWeight: number;
				};
				startTime: string;
				endTime: string;
				reason: string | null;
				decisionNote: string | null;
				requestedAt: string;
				expiresAt: string | null;
				approval: {
					route: "staff" | "supervisor" | "auto";
					status: "Pending" | "Approved" | "Rejected" | "Canceled";
					approvedBy: {
						accountKey: number;
						studentId: string;
						firstName: string;
						lastName: string;
						creditScore: number;
					} | null;
					autoApproved: boolean;
					approvedAt: string | null;
					resolvedAt: string | null;
				};
				usageKey: number | null;
				dueAt: string | null;
				cancellable: boolean;
			};
			meta: object;
		}>;
		confirmMyPickup: import("@trpc/server").TRPCMutationProcedure<{
			input: {
				usageKey: number;
			};
			output: {
				reservationKey: number;
				status: "pending" | "approved" | "preparing" | "ready" | "inUse" | "returned" | "done" | "rejected" | "cancelled";
				resource: {
					resourceKey: number;
					name: string | null;
					serialNo: string | null;
					kind: "equipment" | "room";
					tier: "T0" | "T1" | "T2" | "T3" | null;
					creditWeight: number;
				};
				startTime: string;
				endTime: string;
				reason: string | null;
				decisionNote: string | null;
				requestedAt: string;
				expiresAt: string | null;
				approval: {
					route: "staff" | "supervisor" | "auto";
					status: "Pending" | "Approved" | "Rejected" | "Canceled";
					approvedBy: {
						accountKey: number;
						studentId: string;
						firstName: string;
						lastName: string;
						creditScore: number;
					} | null;
					autoApproved: boolean;
					approvedAt: string | null;
					resolvedAt: string | null;
				};
				usageKey: number | null;
				dueAt: string | null;
				cancellable: boolean;
			};
			meta: object;
		}>;
		extensionOptions: import("@trpc/server").TRPCQueryProcedure<{
			input: {
				usageKey: number;
			};
			output: {
				usageKey: number;
				canRequest: boolean;
				blockedBy: string | null;
				route: "staff" | "supervisor" | "auto" | null;
				requiresInspection: boolean;
				currentDueAt: string;
				maxRequestedDueAt: string;
				extensionsUsed: number;
				extensionsAllowed: number;
				pendingExtensionKey: number | null;
			};
			meta: object;
		}>;
		requestExtension: import("@trpc/server").TRPCMutationProcedure<{
			input: {
				usageKey: number;
				requestedDueAt: string;
				reason?: string | undefined;
			};
			output: {
				extensionKey: number;
				usageKey: number;
				status: "Pending" | "Approved" | "Rejected" | "Canceled";
				route: "staff" | "supervisor" | "auto";
				requiresInspection: boolean;
				autoApproved: boolean;
				extendNo: number | null;
				previousDueAt: string;
				requestedDueAt: string;
				dueAt: string;
				requestedAt: string;
				resolvedAt: string | null;
				itemName: string | null;
				serialNo: string | null;
				tier: "T0" | "T1" | "T2" | "T3" | null;
				extensionsUsed: number;
				extensionsAllowed: number;
			};
			meta: object;
		}>;
		myExtensions: import("@trpc/server").TRPCQueryProcedure<{
			input: {
				page?: number | undefined;
				pageSize?: number | undefined;
				q?: string | undefined;
				status?: "Pending" | "Approved" | "Rejected" | "Canceled" | undefined;
			};
			output: {
				items: {
					extensionKey: number;
					usageKey: number;
					status: "Pending" | "Approved" | "Rejected" | "Canceled";
					route: "staff" | "supervisor" | "auto";
					requiresInspection: boolean;
					autoApproved: boolean;
					extendNo: number | null;
					previousDueAt: string;
					requestedDueAt: string;
					dueAt: string;
					requestedAt: string;
					resolvedAt: string | null;
					itemName: string | null;
					serialNo: string | null;
					tier: "T0" | "T1" | "T2" | "T3" | null;
					extensionsUsed: number;
					extensionsAllowed: number;
				}[];
				total: number;
				page: number;
				pageSize: number;
			};
			meta: object;
		}>;
		cancelExtension: import("@trpc/server").TRPCMutationProcedure<{
			input: {
				extensionKey: number;
			};
			output: {
				extensionKey: number;
				usageKey: number;
				status: "Pending" | "Approved" | "Rejected" | "Canceled";
				route: "staff" | "supervisor" | "auto";
				requiresInspection: boolean;
				autoApproved: boolean;
				extendNo: number | null;
				previousDueAt: string;
				requestedDueAt: string;
				dueAt: string;
				requestedAt: string;
				resolvedAt: string | null;
				itemName: string | null;
				serialNo: string | null;
				tier: "T0" | "T1" | "T2" | "T3" | null;
				extensionsUsed: number;
				extensionsAllowed: number;
			};
			meta: object;
		}>;
		staffQueue: import("@trpc/server").TRPCQueryProcedure<{
			input: {
				bucket: "toPrepare" | "toHandover" | "onLoan" | "overdue";
				page?: number | undefined;
				pageSize?: number | undefined;
				q?: string | undefined;
				sort?: string | undefined;
				order?: "asc" | "desc" | undefined;
				tier?: "T0" | "T1" | "T2" | "T3" | undefined;
			};
			output: {
				items: {
					usageKey: number | null;
					reservationKey: number | null;
					status: "Lended" | "Pending" | "Prepared" | "Returned" | "Inspected" | null;
					borrower: {
						accountKey: number;
						studentId: string;
						firstName: string;
						lastName: string;
						creditScore: number;
					};
					itemName: string | null;
					serialNo: string | null;
					resourceKey: number | null;
					tier: "T0" | "T1" | "T2" | "T3" | null;
					prepDays: number;
					pickupAt: string | null;
					dueAt: string | null;
					overdueDays: number;
					lostEligible: boolean;
				}[];
				total: number;
				page: number;
				pageSize: number;
			};
			meta: object;
		}>;
		queueCounts: import("@trpc/server").TRPCQueryProcedure<{
			input: void;
			output: {
				toPrepare: number;
				toHandover: number;
				onLoan: number;
				overdue: number;
				toInspect: number;
				extensionsToInspect: number;
			};
			meta: object;
		}>;
		getForStaff: import("@trpc/server").TRPCQueryProcedure<{
			input: {
				usageKey: number;
			};
			output: {
				usageKey: number;
				reservationKey: number | null;
				status: "Lended" | "Pending" | "Prepared" | "Returned" | "Inspected";
				borrower: {
					accountKey: number;
					studentId: string;
					firstName: string;
					lastName: string;
					creditScore: number;
				};
				itemName: string | null;
				serialNo: string | null;
				resourceKey: number;
				tier: "T0" | "T1" | "T2" | "T3" | null;
				checkoutCondition: "Normal" | "MinorDamage" | "MajorDamage" | "Broken" | "Missing" | null;
				checkoutConditionNote: string | null;
				checkinCondition: "Normal" | "MinorDamage" | "MajorDamage" | "Broken" | "Missing" | null;
				checkoutAt: string;
				dueAt: string;
				returnedAt: string | null;
				overdueDays: number;
				pendingExtensionKey: number | null;
			};
			meta: object;
		}>;
		allocate: import("@trpc/server").TRPCMutationProcedure<{
			input: {
				reservationKey: number;
				resourceKey?: number | undefined;
				condition?: "Normal" | "MinorDamage" | "MajorDamage" | "Broken" | "Missing" | undefined;
				note?: string | undefined;
			};
			output: {
				usageKey: number;
				reservationKey: number | null;
				status: "Lended" | "Pending" | "Prepared" | "Returned" | "Inspected";
				borrower: {
					accountKey: number;
					studentId: string;
					firstName: string;
					lastName: string;
					creditScore: number;
				};
				itemName: string | null;
				serialNo: string | null;
				resourceKey: number;
				tier: "T0" | "T1" | "T2" | "T3" | null;
				checkoutCondition: "Normal" | "MinorDamage" | "MajorDamage" | "Broken" | "Missing" | null;
				checkoutConditionNote: string | null;
				checkinCondition: "Normal" | "MinorDamage" | "MajorDamage" | "Broken" | "Missing" | null;
				checkoutAt: string;
				dueAt: string;
				returnedAt: string | null;
				overdueDays: number;
				pendingExtensionKey: number | null;
			};
			meta: object;
		}>;
		swapUnit: import("@trpc/server").TRPCMutationProcedure<{
			input: {
				usageKey: number;
				resourceKey: number;
				reason?: string | undefined;
			};
			output: {
				usageKey: number;
				reservationKey: number | null;
				status: "Lended" | "Pending" | "Prepared" | "Returned" | "Inspected";
				borrower: {
					accountKey: number;
					studentId: string;
					firstName: string;
					lastName: string;
					creditScore: number;
				};
				itemName: string | null;
				serialNo: string | null;
				resourceKey: number;
				tier: "T0" | "T1" | "T2" | "T3" | null;
				checkoutCondition: "Normal" | "MinorDamage" | "MajorDamage" | "Broken" | "Missing" | null;
				checkoutConditionNote: string | null;
				checkinCondition: "Normal" | "MinorDamage" | "MajorDamage" | "Broken" | "Missing" | null;
				checkoutAt: string;
				dueAt: string;
				returnedAt: string | null;
				overdueDays: number;
				pendingExtensionKey: number | null;
			};
			meta: object;
		}>;
		confirmPickup: import("@trpc/server").TRPCMutationProcedure<{
			input: {
				usageKey: number;
				note?: string | undefined;
				early?: boolean | undefined;
			};
			output: {
				usageKey: number;
				reservationKey: number | null;
				status: "Lended" | "Pending" | "Prepared" | "Returned" | "Inspected";
				borrower: {
					accountKey: number;
					studentId: string;
					firstName: string;
					lastName: string;
					creditScore: number;
				};
				itemName: string | null;
				serialNo: string | null;
				resourceKey: number;
				tier: "T0" | "T1" | "T2" | "T3" | null;
				checkoutCondition: "Normal" | "MinorDamage" | "MajorDamage" | "Broken" | "Missing" | null;
				checkoutConditionNote: string | null;
				checkinCondition: "Normal" | "MinorDamage" | "MajorDamage" | "Broken" | "Missing" | null;
				checkoutAt: string;
				dueAt: string;
				returnedAt: string | null;
				overdueDays: number;
				pendingExtensionKey: number | null;
			};
			meta: object;
		}>;
		recordReturn: import("@trpc/server").TRPCMutationProcedure<{
			input: {
				usageKey: number;
				note?: string | undefined;
			};
			output: {
				loan: {
					usageKey: number;
					reservationKey: number | null;
					status: "Lended" | "Pending" | "Prepared" | "Returned" | "Inspected";
					borrower: {
						accountKey: number;
						studentId: string;
						firstName: string;
						lastName: string;
						creditScore: number;
					};
					itemName: string | null;
					serialNo: string | null;
					resourceKey: number;
					tier: "T0" | "T1" | "T2" | "T3" | null;
					checkoutCondition: "Normal" | "MinorDamage" | "MajorDamage" | "Broken" | "Missing" | null;
					checkoutConditionNote: string | null;
					checkinCondition: "Normal" | "MinorDamage" | "MajorDamage" | "Broken" | "Missing" | null;
					checkoutAt: string;
					dueAt: string;
					returnedAt: string | null;
					overdueDays: number;
					pendingExtensionKey: number | null;
				};
				latePenalty: {
					penaltyKey: number;
					creditDeducted: number;
					overdueDays: number;
					expiresAt: string;
				} | null;
			};
			meta: object;
		}>;
		markLost: import("@trpc/server").TRPCMutationProcedure<{
			input: {
				usageKey: number;
				reason?: string | undefined;
				reportedByBorrower?: boolean | undefined;
			};
			output: {
				usageKey: number;
				reservationKey: number | null;
				status: "Lended" | "Pending" | "Prepared" | "Returned" | "Inspected";
				borrower: {
					accountKey: number;
					studentId: string;
					firstName: string;
					lastName: string;
					creditScore: number;
				};
				itemName: string | null;
				serialNo: string | null;
				resourceKey: number;
				tier: "T0" | "T1" | "T2" | "T3" | null;
				checkoutCondition: "Normal" | "MinorDamage" | "MajorDamage" | "Broken" | "Missing" | null;
				checkoutConditionNote: string | null;
				checkinCondition: "Normal" | "MinorDamage" | "MajorDamage" | "Broken" | "Missing" | null;
				checkoutAt: string;
				dueAt: string;
				returnedAt: string | null;
				overdueDays: number;
				pendingExtensionKey: number | null;
			};
			meta: object;
		}>;
		extensionReviews: import("@trpc/server").TRPCQueryProcedure<{
			input: {
				page?: number | undefined;
				pageSize?: number | undefined;
				q?: string | undefined;
				route?: "staff" | "supervisor" | undefined;
				tier?: "T0" | "T1" | "T2" | "T3" | undefined;
			};
			output: {
				items: {
					extensionKey: number;
					usageKey: number;
					borrower: {
						accountKey: number;
						studentId: string;
						firstName: string;
						lastName: string;
						creditScore: number;
					};
					creditTier: "D0" | "D1" | "D2" | "D3";
					route: "staff" | "supervisor" | "auto";
					itemName: string | null;
					serialNo: string | null;
					tier: "T0" | "T1" | "T2" | "T3" | null;
					extendNo: number | null;
					previousDueAt: string;
					requestedDueAt: string;
					requestedAt: string;
					reason: string | null;
					status: "Pending" | "Approved" | "Rejected" | "Canceled";
				}[];
				total: number;
				page: number;
				pageSize: number;
			};
			meta: object;
		}>;
		decideExtension: import("@trpc/server").TRPCMutationProcedure<{
			input: {
				extensionKey: number;
				decision: "approve" | "reject";
				condition?: "Normal" | "MinorDamage" | "MajorDamage" | "Broken" | "Missing" | undefined;
				note?: string | undefined;
			};
			output: {
				extensionKey: number;
				usageKey: number;
				status: "Pending" | "Approved" | "Rejected" | "Canceled";
				route: "staff" | "supervisor" | "auto";
				requiresInspection: boolean;
				autoApproved: boolean;
				extendNo: number | null;
				previousDueAt: string;
				requestedDueAt: string;
				dueAt: string;
				requestedAt: string;
				resolvedAt: string | null;
				itemName: string | null;
				serialNo: string | null;
				tier: "T0" | "T1" | "T2" | "T3" | null;
				extensionsUsed: number;
				extensionsAllowed: number;
			};
			meta: object;
		}>;
	}>>;
	notification: import("@trpc/server").TRPCBuiltRouter<{
		ctx: object;
		meta: object;
		errorShape: import("@trpc/server").TRPCDefaultErrorShape;
		transformer: false;
	}, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
		list: import("@trpc/server").TRPCQueryProcedure<{
			input: {
				page?: number | undefined;
				pageSize?: number | undefined;
				q?: string | undefined;
				sort?: string | undefined;
				order?: "asc" | "desc" | undefined;
				unreadOnly?: boolean | undefined;
			};
			output: {
				items: {
					id: string;
					userId: string;
					type: "overdue" | "request_approved" | "request_rejected" | "pickup_reminder" | "due_soon" | "credit_deducted" | "appeal_result" | "retirement_requested" | "retirement_decided" | "supervisor_approval_needed" | "appeal_filed" | "staff_task";
					title: string;
					body: string;
					createdAt: string;
					readAt?: string | undefined;
					linkTo?: string | undefined;
				}[];
				total: number;
				page: number;
				pageSize: number;
			};
			meta: object;
		}>;
		unreadCount: import("@trpc/server").TRPCQueryProcedure<{
			input: void;
			output: {
				unread: number;
			};
			meta: object;
		}>;
		markRead: import("@trpc/server").TRPCMutationProcedure<{
			input: {
				id: string;
			};
			output: {
				ok: true;
			};
			meta: object;
		}>;
		markAllRead: import("@trpc/server").TRPCMutationProcedure<{
			input: void;
			output: {
				ok: true;
			};
			meta: object;
		}>;
	}>>;
	report: import("@trpc/server").TRPCBuiltRouter<{
		ctx: object;
		meta: object;
		errorShape: import("@trpc/server").TRPCDefaultErrorShape;
		transformer: false;
	}, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
		summary: import("@trpc/server").TRPCQueryProcedure<{
			input: {
				topLimit?: number | undefined;
			};
			output: {
				generatedAt: string;
				unscoped: boolean;
				totals: {
					loans: number;
					overdue: number;
					unitsHeld: number;
					unitsOut: number;
				};
				departments: {
					manageGroupKey: number;
					name: string | null;
					loans: number;
					overdue: number;
					utilization: number;
					unitsHeld: number;
					unitsOut: number;
				}[];
				topEquipment: {
					itemKey: number;
					name: string | null;
					tier: "T0" | "T1" | "T2" | "T3" | null;
					count: number;
				}[];
				damage: {
					condition: "Normal" | "MinorDamage" | "MajorDamage" | "Broken" | "Missing";
					count: number;
				}[];
				roomUtilization: {
					rooms: number;
					bookedHours: number;
					openHours: number;
					percent: number;
				};
			};
			meta: object;
		}>;
	}>>;
}>>;
export type AppRouter = typeof appRouter;

export {};
