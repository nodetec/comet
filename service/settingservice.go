package service

import (
	"context"
	"log"

	"github.com/nodetec/comet/db"
)

type Setting struct {
	Key   string
	Value string
}

type Settings struct {
	// theme
	Theme string
	// editor
	Vim                 string
	LineNumbers         string
	HighlightActiveLine string
	LineWrapping        string
	IndentSpaces        string
	FontSize            string
	FontFamily          string
	LineHeight          string
	// profile
	Npub string
	Nsec string
	// relays
	Relays string
}

type SettingService struct {
	queries *db.Queries
	logger  *log.Logger
}

func NewSettingService(queries *db.Queries, logger *log.Logger) *SettingService {
	return &SettingService{
		queries: queries,
		logger:  logger,
	}
}

func (s *SettingService) GetSetting(ctx context.Context, key string) (string, error) {
	setting, err := s.queries.GetSetting(ctx, key)
	if err != nil {
		s.logger.Printf("Error getting setting with Key %s: %v", key, err)
		return "", err
	}
	return setting.Value, nil
}

func (s *SettingService) GetAllSettings(ctx context.Context) (Settings, error) {
	settings, err := s.queries.GetAllSettings(ctx)
	if err != nil {
		s.logger.Printf("Error getting all settings: %v", err)
		return Settings{}, err
	}

	settingsMap := make(map[string]string)

	for _, setting := range settings {
		settingsMap[setting.Key] = setting.Value
	}

	var result Settings
	for key, value := range settingsMap {
		switch key {
		// theme
		case "theme":
			result.Theme = value
		// editor
		case "vim":
			result.Vim = value
		case "lineNumbers":
			result.LineNumbers = value
		case "highlightActiveLine":
			result.HighlightActiveLine = value
		case "lineWrapping":
			result.LineWrapping = value
		case "indentSpaces":
			result.IndentSpaces = value
		case "fontSize":
			result.FontSize = value
		case "fontFamily":
			result.FontFamily = value
		case "lineHeight":
			result.LineHeight = value
			// profile
		case "npub":
			result.Npub = value
		case "nsec":
			result.Nsec = value
			// relays
		case "relays":
			result.Relays = value
		}
	}

	return result, nil
}

func (s *SettingService) UpdateSetting(ctx context.Context, key string, value string) error {
	params := db.UpdateSettingParams{
		Key:   key,
		Value: value,
	}
	err := s.queries.UpdateSetting(ctx, params)
	if err != nil {
		s.logger.Printf("Error updating setting with Key %s: %v", key, err)
		return err
	}
	return nil
}
