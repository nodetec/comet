package service

type NoteService struct{}

func (g *NoteService) Greet(name string) string {
	return "Hello " + name + "!"
}
