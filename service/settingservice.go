package service

import (
	"context"
	"fmt"
	"log"

	"github.com/nodetec/captains-log/db"
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
	UnorderedListBullet string
	IndentUnit          string
	TabSize             string
	FontSize            string
	FontFamily          string
	FontWeight          string
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

func (s *SettingService) GetSetting(ctx context.Context, key string) (Setting, error) {
	setting, err := s.queries.GetSetting(ctx, key)
	if err != nil {
		s.logger.Printf("Error getting setting with Key %s: %v", key, err)
		return Setting{}, err
	}
	return Setting{
		Key:   setting.Key,
		Value: setting.Value,
	}, nil
}

func (s *SettingService) GetAllSettings(ctx context.Context) (Settings, error) {
	settings, err := s.queries.GetAllSettings(ctx)
	fmt.Println("settings ", settings)
	if err != nil {
		s.logger.Printf("Error getting all settings: %v", err)
		return Settings{}, err
	}

	settingsMap := make(map[string]interface{})

	for _, setting := range settings {
		settingsMap[setting.Key] = setting.Value
	}

	var result Settings
	for key, value := range settingsMap {
		switch key {
		// theme
		case "theme":
			result.Theme = value.(string)
		// editor
		case "vim":
			result.Vim = value.(string)
		case "lineNumbers":
			result.LineNumbers = value.(string)
		case "highlightActiveLine":
			result.HighlightActiveLine = value.(string)
		case "lineWrapping":
			result.LineWrapping = value.(string)
		case "unorderedListBullet":
			result.UnorderedListBullet = value.(string)
		case "indentUnit":
			result.IndentUnit = value.(string)
		case "tabSize":
			result.TabSize = value.(string)
		case "fontSize":
			result.FontSize = value.(string)
		case "fontFamily":
			result.FontFamily = value.(string)
		case "fontWeight":
			result.FontWeight = value.(string)
		case "lineHeight":
			result.LineHeight = value.(string)
			// profile
		case "npub":
			result.Npub = value.(string)
		case "nsec":
			result.Nsec = value.(string)
			// relays
		case "relays":
			result.Relays = value.(string)
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
