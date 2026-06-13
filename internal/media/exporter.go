package media

import (
	"context"
	"fmt"
	"io"
	"os"
)

// progressFunc is the progress callback signature used by Exporter.Export.
// Spec FR3: "Progress is reported via a simple callback."
type progressFunc func(percent float64, msg string)

// Exporter copies an original media file to a user-selected destination
// using a buffered io.Copy. It reports progress via a callback and
// honors context cancellation. It does NOT use GStreamer.
type Exporter struct{}

// NewExporter creates a new Exporter.
func NewExporter() *Exporter { return &Exporter{} }

// Export copies the file at srcPath to destPath, reporting progress via
// the callback (0.0 at start, 1.0 at completion). It checks ctx.Err()
// after every chunk and returns an error wrapping context.Canceled if
// the context is done. Returns an error wrapping os.ErrNotExist when
// srcPath is missing.
func (e *Exporter) Export(ctx context.Context, srcPath, destPath string, progress progressFunc) error {
	src, err := os.Open(srcPath)
	if err != nil {
		return fmt.Errorf("open source: %w", err)
	}
	defer src.Close()

	info, err := src.Stat()
	if err != nil {
		return fmt.Errorf("stat source: %w", err)
	}
	totalSize := info.Size()

	dest, err := os.Create(destPath)
	if err != nil {
		return fmt.Errorf("create destination: %w", err)
	}
	defer func() {
		dest.Close()
		if ctx.Err() != nil {
			os.Remove(destPath)
		}
	}()

	if progress != nil {
		progress(0.0, "Starting export...")
	}

	const bufSize = 32 * 1024
	buf := make([]byte, bufSize)
	var copied int64

	for {
		if err := ctx.Err(); err != nil {
			return err
		}

		n, readErr := src.Read(buf)
		if n > 0 {
			written, writeErr := dest.Write(buf[:n])
			if writeErr != nil {
				return fmt.Errorf("write destination: %w", writeErr)
			}
			copied += int64(written)

			if progress != nil && totalSize > 0 {
				pct := float64(copied) / float64(totalSize)
				if pct > 1.0 {
					pct = 1.0
				}
				progress(pct, fmt.Sprintf("Exported %d / %d bytes", copied, totalSize))
			}
		}

		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			return fmt.Errorf("read source: %w", readErr)
		}
	}

	if progress != nil {
		progress(1.0, "Export complete")
	}

	return nil
}
