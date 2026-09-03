create index if not exists chatbot_sessions_selected_reservation_idx
  on public.chatbot_sessions (selected_reservation_id)
  where selected_reservation_id is not null;
