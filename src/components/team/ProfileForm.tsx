"use client";

import { useActionState, useState } from "react";
import { updateProfileAction } from "@/lib/profile/actions";
import SubmitButton from "@/components/team/SubmitButton";
import Avatar from "@/components/team/Avatar";

export default function ProfileForm({
  name: initialName,
  email: initialEmail,
  phone: initialPhone,
  bio: initialBio,
  avatarUrl,
}: {
  name: string;
  email: string;
  phone: string;
  bio: string;
  avatarUrl: string | null;
}) {
  const [state, formAction] = useActionState(updateProfileAction, undefined);
  const [name, setName] = useState(initialName);
  const [bio, setBio] = useState(initialBio);
  const [preview, setPreview] = useState<string | null>(null);

  return (
    <form action={formAction} className="space-y-5">
      <div className="flex items-center gap-4">
        <Avatar name={name || "?"} avatarUrl={preview ?? avatarUrl} size="md" className="h-16 w-16 text-lg" />
        <div>
          <label htmlFor="avatar" className="text-sm font-medium text-navy hover:underline cursor-pointer">
            Change photo
          </label>
          <input
            id="avatar"
            name="avatar"
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) setPreview(URL.createObjectURL(file));
            }}
          />
          <p className="text-xs text-ink/40">Leave blank to keep your current photo.</p>
        </div>
      </div>

      <div>
        <label htmlFor="name" className="text-sm font-medium text-ink/80">
          Full name
        </label>
        <input
          id="name"
          name="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1.5 w-full rounded-md border border-hairline-strong px-3 py-2.5 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/10"
        />
      </div>

      <div>
        <label htmlFor="email" className="text-sm font-medium text-ink/80">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          defaultValue={initialEmail}
          className="mt-1.5 w-full rounded-md border border-hairline-strong px-3 py-2.5 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/10"
        />
      </div>

      <div>
        <label htmlFor="phone" className="text-sm font-medium text-ink/80">
          Phone <span className="font-normal text-ink/40">(optional)</span>
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          defaultValue={initialPhone}
          placeholder="(555) 555-5555"
          className="mt-1.5 w-full rounded-md border border-hairline-strong px-3 py-2.5 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/10"
        />
      </div>

      <div>
        <div className="flex items-baseline justify-between">
          <label htmlFor="bio" className="text-sm font-medium text-ink/80">
            Bio <span className="font-normal text-ink/40">(optional)</span>
          </label>
          <span className="text-xs text-ink/40">{bio.length}/2000</span>
        </div>
        <textarea
          id="bio"
          name="bio"
          rows={6}
          maxLength={2000}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="Tell the team a bit about yourself — subteam interests, what you're working on, fun facts…"
          className="mt-1.5 w-full resize-y rounded-md border border-hairline-strong px-3 py-2.5 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/10"
        />
      </div>

      {state?.error && (
        <p className="rounded-md bg-crimson/10 px-3 py-2 text-sm text-crimson">{state.error}</p>
      )}
      {state?.success && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">Saved.</p>
      )}

      <SubmitButton>Save changes</SubmitButton>
    </form>
  );
}
