// Browser rehearsal has no database connection and cannot send invitations.
export const supabase = {
  auth: { getSession: async () => ({ data: { session: null } }) },
};
