# Current Directive: Embedded Video Preview in GTK4

## Active Directive
**Implement embedded video preview using gtk4paintablesink instead of external window.**

## Scope
- **Plugin Installation**: Verify/install gstreamer1.0-plugins-bad for gtk4paintablesink
- **Pipeline Update**: Replace autovideosink with gtk4paintablesink
- **GTK Integration**: Use GdkPaintable with GtkImage or GtkPicture widget
- **Thread Safety**: Ensure proper main thread updates for video frames

## Success Criteria
- Video preview displays embedded in GTK4 window (not external)
- Application runs correctly with/without hardware
- All Go tests pass
- No GTK main loop blocking

## Timeline
Started: 2026-03-26
Target Completion: 2026-03-26

## Next Steps
- Phase 1: Verify gtk4paintablesink availability and bindings
- Phase 2: Update PreviewPipeline to use gtk4paintablesink
- Phase 3: Integrate with GTK4 Picture widget
