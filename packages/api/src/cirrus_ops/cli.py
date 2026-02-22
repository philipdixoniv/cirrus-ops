import asyncio
import logging
from datetime import datetime
import click
import typer
from rich.console import Console
from rich.table import Table

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)

app = typer.Typer(name="cirrus", help="Cirrus Ops - Meeting transcript pipeline")
sync_app = typer.Typer(help="Sync meetings from platforms")
app.add_typer(sync_app, name="sync")
profiles_app = typer.Typer(help="Manage mining profiles")
app.add_typer(profiles_app, name="profiles")
console = Console()


# ---------------------------------------------------------------------------
# Sync commands
# ---------------------------------------------------------------------------


@sync_app.command("gong")
def sync_gong(
    full: bool = typer.Option(False, "--full", help="Run a full bulk sync instead of incremental"),
) -> None:
    """Sync meetings from Gong."""
    from cirrus_ops.gong.sync import bulk_sync, incremental_sync

    try:
        if full:
            console.print("[bold blue]Starting full Gong sync...[/bold blue]")
            asyncio.run(bulk_sync())
        else:
            console.print("[bold blue]Starting incremental Gong sync...[/bold blue]")
            asyncio.run(incremental_sync())
        console.print("[green]\u2713[/green] Gong sync complete")
    except Exception:
        console.print("[red]\u2717[/red] Gong sync failed")
        console.print_exception()
        raise typer.Exit(code=1)


@sync_app.command("zoom")
def sync_zoom(
    full: bool = typer.Option(False, "--full", help="Run a full bulk sync instead of incremental"),
) -> None:
    """Sync meetings from Zoom."""
    from cirrus_ops.zoom.sync import bulk_sync, incremental_sync

    try:
        if full:
            console.print("[bold blue]Starting full Zoom sync...[/bold blue]")
            asyncio.run(bulk_sync())
        else:
            console.print("[bold blue]Starting incremental Zoom sync...[/bold blue]")
            asyncio.run(incremental_sync())
        console.print("[green]\u2713[/green] Zoom sync complete")
    except Exception:
        console.print("[red]\u2717[/red] Zoom sync failed")
        console.print_exception()
        raise typer.Exit(code=1)


@sync_app.command("all")
def sync_all(
    full: bool = typer.Option(False, "--full", help="Run a full bulk sync instead of incremental"),
) -> None:
    """Sync meetings from all platforms."""
    from cirrus_ops.gong.sync import bulk_sync as gong_bulk, incremental_sync as gong_inc
    from cirrus_ops.zoom.sync import bulk_sync as zoom_bulk, incremental_sync as zoom_inc

    try:
        if full:
            console.print("[bold blue]Starting full sync for all platforms...[/bold blue]")
            asyncio.run(gong_bulk())
            console.print("[green]\u2713[/green] Gong sync complete")
            asyncio.run(zoom_bulk())
            console.print("[green]\u2713[/green] Zoom sync complete")
        else:
            console.print("[bold blue]Starting incremental sync for all platforms...[/bold blue]")
            asyncio.run(gong_inc())
            console.print("[green]\u2713[/green] Gong sync complete")
            asyncio.run(zoom_inc())
            console.print("[green]\u2713[/green] Zoom sync complete")
        console.print("[green]\u2713[/green] All syncs complete")
    except Exception:
        console.print("[red]\u2717[/red] Sync failed")
        console.print_exception()
        raise typer.Exit(code=1)


# ---------------------------------------------------------------------------
# Status command
# ---------------------------------------------------------------------------


@app.command("status")
def status() -> None:
    """Show sync status and meeting counts for all platforms."""
    from cirrus_ops import db

    try:
        table = Table(title="Sync Status")
        table.add_column("Platform", style="cyan")
        table.add_column("Status", style="bold")
        table.add_column("Last Synced At")
        table.add_column("Total Synced", justify="right")
        table.add_column("Error Message", style="red")

        for platform in ("gong", "zoom"):
            state = db.get_sync_state(platform)
            if state is None:
                table.add_row(platform, "never synced", "-", "0", "-")
            else:
                status_val = state.get("status", "unknown")
                status_style = {
                    "idle": "[green]idle[/green]",
                    "running": "[yellow]running[/yellow]",
                    "error": "[red]error[/red]",
                }.get(status_val, status_val)

                last_synced = state.get("last_synced_at") or "-"
                table.add_row(
                    platform,
                    status_style,
                    str(last_synced),
                    str(state.get("total_synced", 0)),
                    state.get("error_message") or "-",
                )

        console.print(table)

        # Meeting counts
        counts_table = Table(title="Meeting Counts")
        counts_table.add_column("Platform", style="cyan")
        counts_table.add_column("Meetings", justify="right")

        for platform in ("gong", "zoom"):
            count = db.count_meetings(platform)
            counts_table.add_row(platform, str(count))

        console.print(counts_table)
    except Exception:
        console.print("[red]\u2717[/red] Failed to fetch status")
        console.print_exception()
        raise typer.Exit(code=1)


# ---------------------------------------------------------------------------
# Mine command
# ---------------------------------------------------------------------------


@app.command("mine")
def mine(
    meeting_id: str = typer.Option(None, "--meeting-id", help="Mine a single meeting by ID"),
    batch: bool = typer.Option(False, "--batch", help="Mine all meetings since a given date"),
    since: str = typer.Option(None, "--since", help="Date string (YYYY-MM-DD) for batch mining"),
    profile: str = typer.Option("default", "--profile", help="Mining profile to use"),
) -> None:
    """Extract customer stories from meeting transcripts."""
    from cirrus_ops.mining.extractor import extract_stories
    from cirrus_ops import db

    try:
        if meeting_id:
            console.print(
                f"[bold blue]Mining stories from meeting {meeting_id} "
                f"(profile: {profile})...[/bold blue]"
            )
            stories = extract_stories(meeting_id, profile_name=profile)
            console.print(f"[green]\u2713[/green] Extracted {len(stories)} stories")
            for story in stories:
                console.print(f"  - {story['title']}")
        elif batch:
            if not since:
                console.print("[red]\u2717[/red] --since is required when using --batch")
                raise typer.Exit(code=1)
            since_date = datetime.strptime(since, "%Y-%m-%d")
            console.print(
                f"[bold blue]Batch mining meetings since {since_date.date()} "
                f"(profile: {profile})...[/bold blue]"
            )
            # Fetch meetings since the given date and mine each one
            result = (
                db.client()
                .table("meetings")
                .select("id")
                .gte("started_at", since_date.isoformat())
                .execute()
            )
            all_stories = []
            for row in result.data:
                mid = row["id"]
                try:
                    stories = extract_stories(mid, profile_name=profile)
                    all_stories.extend(stories)
                    console.print(f"  [green]\u2713[/green] Meeting {mid}: {len(stories)} stories")
                except ValueError as e:
                    console.print(f"  [yellow]-[/yellow] Meeting {mid}: {e}")
            console.print(f"[green]\u2713[/green] Extracted {len(all_stories)} stories total")
        else:
            console.print("[red]\u2717[/red] Provide --meeting-id or --batch --since")
            raise typer.Exit(code=1)
    except typer.Exit:
        raise
    except Exception:
        console.print("[red]\u2717[/red] Mining failed")
        console.print_exception()
        raise typer.Exit(code=1)


# ---------------------------------------------------------------------------
# Generate command
# ---------------------------------------------------------------------------


@app.command("generate")
def generate(
    story_id: str = typer.Option(..., "--story-id", help="ID of the extracted story"),
    content_type: str = typer.Option(..., "--type", help="Content type to generate"),
    profile: str = typer.Option("default", "--profile", help="Mining profile to use"),
) -> None:
    """Generate content from an extracted customer story."""
    from cirrus_ops.mining.generator import generate_content

    try:
        console.print(
            f"[bold blue]Generating {content_type} for story {story_id} "
            f"(profile: {profile})...[/bold blue]"
        )
        result = generate_content(story_id, content_type, profile_name=profile)
        console.print(f"[green]\u2713[/green] Content generated (id: {result['id']})\n")
        console.print(result["content"])
    except Exception:
        console.print("[red]\u2717[/red] Generation failed")
        console.print_exception()
        raise typer.Exit(code=1)


# ---------------------------------------------------------------------------
# Profiles commands
# ---------------------------------------------------------------------------


@profiles_app.command("list")
def profiles_list() -> None:
    """List all mining profiles."""
    from cirrus_ops import db

    try:
        profiles = db.list_profiles()
        table = Table(title="Mining Profiles")
        table.add_column("Name", style="cyan")
        table.add_column("Display Name", style="bold")
        table.add_column("Description")
        table.add_column("Themes", justify="right")
        table.add_column("Content Types", justify="right")
        table.add_column("Knowledge Docs", justify="right")
        table.add_column("Active")

        for p in profiles:
            content_types = db.get_profile_content_types(p["id"])
            knowledge = db.get_profile_knowledge(p["id"])
            themes = p.get("themes", [])

            table.add_row(
                p["name"],
                p["display_name"],
                (p.get("description") or "")[:60],
                str(len(themes)),
                str(len(content_types)),
                str(len(knowledge)),
                "[green]yes[/green]" if p.get("is_active") else "[red]no[/red]",
            )

        console.print(table)
    except Exception:
        console.print("[red]\u2717[/red] Failed to list profiles")
        console.print_exception()
        raise typer.Exit(code=1)


@profiles_app.command("show")
def profiles_show(
    name: str = typer.Argument(..., help="Profile name to show"),
) -> None:
    """Show details of a mining profile."""
    from cirrus_ops import db

    try:
        profile = db.get_profile(name)
        if profile is None:
            console.print(f"[red]\u2717[/red] Profile not found: {name}")
            raise typer.Exit(code=1)

        console.print(f"\n[bold cyan]{profile['display_name']}[/bold cyan] ({profile['name']})")
        console.print(f"  Description: {profile.get('description', '-')}")
        console.print(f"  Confidence threshold: {profile.get('confidence_threshold', 0.5)}")
        console.print(f"  Active: {profile.get('is_active', True)}")

        themes = profile.get("themes", [])
        console.print(f"\n  [bold]Themes[/bold] ({len(themes)}):")
        for t in themes:
            console.print(f"    - {t}")

        content_types = db.get_profile_content_types(profile["id"])
        console.print(f"\n  [bold]Content Types[/bold] ({len(content_types)}):")
        for ct in content_types:
            console.print(
                f"    - {ct['name']} ({ct['display_name']}) "
                f"[dim]max_tokens={ct.get('max_tokens', 4096)}[/dim]"
            )

        knowledge = db.get_profile_knowledge(profile["id"])
        console.print(f"\n  [bold]Knowledge Documents[/bold] ({len(knowledge)}):")
        for k in knowledge:
            console.print(
                f"    - {k['name']} ({k['display_name']}) "
                f"[dim]usage={k['usage']}, {len(k['content'])} chars[/dim]"
            )

        console.print()
    except typer.Exit:
        raise
    except Exception:
        console.print("[red]\u2717[/red] Failed to show profile")
        console.print_exception()
        raise typer.Exit(code=1)


# ---------------------------------------------------------------------------
# Serve command (FastAPI)
# ---------------------------------------------------------------------------


@app.command("serve")
def serve(
    host: str = typer.Option("0.0.0.0", "--host", help="Host to bind to"),
    port: int = typer.Option(8000, "--port", help="Port to bind to"),
    reload: bool = typer.Option(False, "--reload", help="Enable auto-reload for development"),
) -> None:
    """Start the Cirrus Ops REST API server."""
    import uvicorn

    console.print(
        f"[bold blue]Starting Cirrus Ops API on {host}:{port}...[/bold blue]"
    )
    uvicorn.run(
        "cirrus_ops.api.app:app",
        host=host,
        port=port,
        reload=reload,
    )


if __name__ == "__main__":
    app()
