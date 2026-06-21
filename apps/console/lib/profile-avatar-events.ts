export const PROFILE_AVATAR_UPDATED_EVENT = "planisfy:profile-avatar-updated";

export interface ProfileAvatarUpdatedDetail {
  avatarUrl: string | null;
}

export function dispatchProfileAvatarUpdated(avatarUrl: string | null) {
  window.dispatchEvent(
    new CustomEvent<ProfileAvatarUpdatedDetail>(PROFILE_AVATAR_UPDATED_EVENT, {
      detail: { avatarUrl },
    }),
  );
}
