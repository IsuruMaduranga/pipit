/**
 * The product's cron text (the profile's `text.background.cron`): the
 * cron_create, cron_list and cron_delete descriptions and parameters.
 *
 * This product turns the cron tools off (profile/index.ts), so the text is
 * sent only if a later version turns them on. It states what the base's
 * scheduler does (lib/agents/cron.ts): session-only jobs, local time, a
 * deterministic jitter, and recurring jobs that expire after `maxAgeDays`.
 */

import type { CronText } from "../../../extensions/sdk/profile.ts";

export const cron: CronText = {
	createDescription: ({ maxAgeDays }) => `Queue a prompt to run later, once or on a repeating schedule.

The schedule is a standard five-field cron expression in the user's local time zone: minute, hour, day of month, month, day of week. "15 10 * * *" means 10:15 local time; no time-zone conversion is needed.

## Once (recurring: false)

For "remind me at ..." or "at ..., do ..." requests. The job fires a single time and then removes itself. Fix the minute, hour, day of month and month:
  "at 4:40pm today, check whether the build passed" → cron: "40 16 <today's day> <this month> *", recurring: false
  "first thing tomorrow, rerun the integration tests" → cron: "53 7 <tomorrow's day> <tomorrow's month> *", recurring: false

## Repeating (the default, recurring: true)

For requests such as "each N minutes", "hourly" or "on weekdays at 9":
  "*/10 * * * *" (every 10 minutes), "13 * * * *" (hourly), "4 9 * * 1-5" (weekdays at about 9 local)

## Stay off the full and half hour when you can

Rounded times bunch everyone's jobs onto the same instant. When the user's time is approximate, choose a minute other than 0 or 30:
  "each morning around 8" → "52 7 * * *" or "6 8 * * *", not "0 8 * * *"
  "every hour" → "13 * * * *", not "0 * * * *"
Use minute 0 or 30 only if the user asks for exactly that time and means it ("at 9:00 sharp", "on the half hour", to line up with a meeting). A few minutes either way goes unnoticed.

## This session only

Jobs exist only while this session runs. Nothing is saved to disk, and the jobs end with the session.

## Not for watching

A cron job repeats a prompt on the clock. To react the moment a log, process or command shows something, use the monitor tool, which streams events as they happen.

## How jobs run

A job fires only while the session is idle, never in the middle of a turn. The scheduler shifts each job by a small fixed amount: a repeating job fires up to 10% of its period late (15 minutes at most), and a one-time job set for :00 or :30 fires up to 90 seconds early. Choosing an off-minute still matters more.

A repeating job expires after ${maxAgeDays} days: it fires one last time and is then removed. Mention this ${maxAgeDays}-day limit to the user when you schedule one.

The result is a job id, which cron_delete takes.`,
	createParams: ({ maxAgeDays }) => ({
		cron: 'A five-field cron expression in local time, "minute hour day-of-month month day-of-week". For example "*/10 * * * *" runs every 10 minutes, and "45 15 3 7 *" runs once at 3:45pm local time on July 3.',
		prompt: "The prompt to queue each time the job fires.",
		recurring: `true (the default) fires at every match until the job is deleted or expires after ${maxAgeDays} days. false fires at the next match only and then removes the job; use it, with the minute, hour, day and month fixed, for one-time reminders.`,
		durable: "No effect: jobs cannot be saved. Every job lives in memory and ends with this session.",
	}),
	listDescription: "Show the cron jobs created with cron_create in this session.",
	deleteDescription: "Cancel a cron job created with cron_create, removing it from this session.",
	deleteIdParam: "The job id cron_create returned.",
};
