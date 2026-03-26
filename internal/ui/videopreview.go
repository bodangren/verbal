package ui

import (
	"verbal/internal/media"

	"github.com/diamondburned/gotk4/pkg/gtk/v4"
)

type VideoPreview struct {
	box      *gtk.Box
	picture  *gtk.Picture
	status   *gtk.Label
	pipeline *media.EmbeddedPipeline
}

func NewVideoPreview() *VideoPreview {
	box := gtk.NewBox(gtk.OrientationVertical, 6)

	picture := gtk.NewPicture()
	picture.SetMarginStart(12)
	picture.SetMarginEnd(12)
	picture.SetMarginTop(12)
	picture.SetMarginBottom(12)
	picture.SetHExpand(true)
	picture.SetVExpand(true)

	status := gtk.NewLabel("No video source")
	status.AddCSSClass("dim-label")

	box.Append(picture)
	box.Append(status)

	return &VideoPreview{
		box:     box,
		picture: picture,
		status:  status,
	}
}

func (v *VideoPreview) Widget() gtk.Widgetter {
	return v.box
}

func (v *VideoPreview) SetPipeline(pipeline *media.EmbeddedPipeline) {
	if v.pipeline != nil {
		v.pipeline.Stop()
	}
	v.pipeline = pipeline

	if pipeline != nil {
		paintable := pipeline.Paintable()
		if paintable != nil {
			v.picture.SetPaintable(paintable)
			v.status.SetText("Video preview ready")
		} else {
			v.status.SetText("Failed to get paintable")
		}
	} else {
		v.picture.SetPaintable(nil)
		v.status.SetText("No video source")
	}
}

func (v *VideoPreview) Start() {
	if v.pipeline != nil {
		v.pipeline.Start()
		v.status.SetText("Video preview running")
	}
}

func (v *VideoPreview) Stop() {
	if v.pipeline != nil {
		v.pipeline.Stop()
		v.status.SetText("Video preview stopped")
	}
}

func (v *VideoPreview) GetState() media.PipelineState {
	if v.pipeline == nil {
		return media.StateStopped
	}
	return v.pipeline.GetState()
}

func (v *VideoPreview) UsesHardware() bool {
	if v.pipeline == nil {
		return false
	}
	return v.pipeline.UsesHardware()
}
