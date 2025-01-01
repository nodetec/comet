package events

import (
	"github.com/wailsapp/wails/v3/pkg/application"
)

var app *application.App

// Init initializes the event system with the application instance
func Init(a *application.App) {
	app = a
}

// Emit emits an event with the given name and data
func Emit(eventName string, data interface{}) {
	if app != nil {
		app.EmitEvent(eventName, data)
	}
}
