-- Chat system with moderation
create type public.chat_room_type as enum ('global', 'game', 'tournament', 'direct');

create table public.chat_rooms (
  id              uuid primary key default gen_random_uuid(),
  type            public.chat_room_type not null,
  name            text not null check (char_length(name) between 2 and 60),
  description     text check (char_length(description) <= 200),
  game_id         uuid references public.games(id) on delete cascade,
  tournament_id   uuid references public.tournaments(id) on delete cascade,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);
create index chat_rooms_type_idx on public.chat_rooms(type);
create index chat_rooms_game_idx on public.chat_rooms(game_id);
create index chat_rooms_tournament_idx on public.chat_rooms(tournament_id);

-- Chat room participants
create table public.chat_participants (
  id              uuid primary key default gen_random_uuid(),
  room_id         uuid not null references public.chat_rooms(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  joined_at       timestamptz not null default now(),
  is_muted        boolean not null default false,
  muted_until     timestamptz,
  unique (room_id, user_id)
);
create index chat_participants_room_idx on public.chat_participants(room_id);
create index chat_participants_user_idx on public.chat_participants(user_id);
create index chat_participants_muted_idx on public.chat_participants(user_id, muted_until) where is_muted = true;

-- Chat messages
create table public.chat_messages (
  id              uuid primary key default gen_random_uuid(),
  room_id         uuid not null references public.chat_rooms(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  content         text not null check (char_length(content) between 1 and 500),
  is_deleted      boolean not null default false,
  is_flagged      boolean not null default false,
  created_at      timestamptz not null default now()
);
create index chat_messages_room_idx on public.chat_messages(room_id, created_at desc);
create index chat_messages_user_idx on public.chat_messages(user_id);
create index chat_messages_flagged_idx on public.chat_messages(room_id, created_at) where is_flagged = true;

-- Direct message conversations (for private chats)
create table public.conversations (
  id              uuid primary key default gen_random_uuid(),
  user1_id        uuid not null references public.profiles(id) on delete cascade,
  user2_id        uuid not null references public.profiles(id) on delete cascade,
  created_at      timestamptz not null default now(),
  check (user1_id < user2_id),
  unique (user1_id, user2_id)
);
create index conversations_user1_idx on public.conversations(user1_id);
create index conversations_user2_idx on public.conversations(user2_id);

-- Direct messages
create table public.direct_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id       uuid not null references public.profiles(id) on delete cascade,
  content         text not null check (char_length(content) between 1 and 500),
  is_deleted      boolean not null default false,
  is_flagged      boolean not null default false,
  created_at      timestamptz not null default now()
);
create index direct_messages_conversation_idx on public.direct_messages(conversation_id, created_at desc);
create index direct_messages_sender_idx on public.direct_messages(sender_id);
create index direct_messages_flagged_idx on public.direct_messages (is_flagged) where is_flagged = true;

-- User block list
create table public.user_blocks (
  id              uuid primary key default gen_random_uuid(),
  blocker_id      uuid not null references public.profiles(id) on delete cascade,
  blocked_id      uuid not null references public.profiles(id) on delete cascade,
  blocked_at      timestamptz not null default now(),
  check (blocker_id <> blocked_id),
  unique (blocker_id, blocked_id)
);
create index user_blocks_blocker_idx on public.user_blocks(blocker_id);
create index user_blocks_blocked_idx on public.user_blocks(blocked_id);

-- Profanity filter word list
create table public.profanity_words (
  id              serial primary key,
  word            text not null unique,
  severity        text not null default 'medium' check (severity in ('mild', 'medium', 'severe'))
);

-- Function to check for profanity
create or replace function public.contains_profanity(p_text text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profanity_words
    where lower(p_text) ~* ('\\b' || word || '\\b')
  );
$$;

-- Function to send chat message
create or replace function public.send_chat_message(
  p_room_id uuid,
  p_content text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_message_id uuid;
  v_is_muted boolean;
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  if exists (select 1 from public.profiles where id = auth.uid() and banned) then
    raise exception 'account banned';
  end if;

  -- Check if muted
  select is_muted into v_is_muted
  from public.chat_participants
  where room_id = p_room_id and user_id = auth.uid();

  if v_is_muted = true then
    raise exception 'you are muted in this room';
  end if;

  -- Check for profanity
  if public.contains_profanity(p_content) then
    raise exception 'message contains inappropriate language';
  end if;

  -- Send message
  insert into public.chat_messages (room_id, user_id, content)
  values (p_room_id, auth.uid(), p_content)
  returning id into v_message_id;

  return v_message_id;
end $$;

-- Function to send direct message
create or replace function public.send_direct_message(
  p_recipient_id uuid,
  p_content text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_conversation_id uuid;
  v_message_id uuid;
  v_is_blocked boolean;
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  if exists (select 1 from public.profiles where id = auth.uid() and banned) then
    raise exception 'account banned';
  end if;

  -- Check if blocked
  select exists(select 1) into v_is_blocked
  from public.user_blocks
  where (blocker_id = p_recipient_id and blocked_id = auth.uid())
     or (blocker_id = auth.uid() and blocked_id = p_recipient_id);

  if v_is_blocked then
    raise exception 'cannot send message to blocked user';
  end if;

  -- Check for profanity
  if public.contains_profanity(p_content) then
    raise exception 'message contains inappropriate language';
  end if;

  -- Get or create conversation
  select id into v_conversation_id
  from public.conversations
  where user1_id = least(auth.uid(), p_recipient_id)
    and user2_id = greatest(auth.uid(), p_recipient_id);

  if not found then
    insert into public.conversations (user1_id, user2_id)
    values (least(auth.uid(), p_recipient_id), greatest(auth.uid(), p_recipient_id))
    returning id into v_conversation_id;
  end if;

  -- Send message
  insert into public.direct_messages (conversation_id, sender_id, content)
  values (v_conversation_id, auth.uid(), p_content)
  returning id into v_message_id;

  return v_message_id;
end $$;

-- RLS for chat
alter table public.chat_rooms enable row level security;
create policy chat_rooms_read on public.chat_rooms for select using (is_active = true);
create policy chat_rooms_admin on public.chat_rooms for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

alter table public.chat_participants enable row level security;
create policy chat_participants_read on public.chat_participants
  for select using (user_id = auth.uid());
create policy chat_participants_admin on public.chat_participants for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

alter table public.chat_messages enable row level security;
create policy chat_messages_read on public.chat_messages
  for select using (room_id in (select room_id from public.chat_participants where user_id = auth.uid()));
create policy chat_messages_admin on public.chat_messages for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

alter table public.conversations enable row level security;
create policy conversations_read on public.conversations
  for select using (user1_id = auth.uid() or user2_id = auth.uid());
create policy conversations_admin on public.conversations for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

alter table public.direct_messages enable row level security;
create policy direct_messages_read on public.direct_messages
  for select using (conversation_id in (
    select id from public.conversations where user1_id = auth.uid() or user2_id = auth.uid()
  ));
create policy direct_messages_admin on public.direct_messages for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

alter table public.user_blocks enable row level security;
create policy user_blocks_read on public.user_blocks
  for select using (blocker_id = auth.uid());
create policy user_blocks_write on public.user_blocks for insert
  with check (blocker_id = auth.uid());
create policy user_blocks_delete on public.user_blocks for delete
  using (blocker_id = auth.uid());
