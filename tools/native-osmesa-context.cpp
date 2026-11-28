// Test-only GLFW backend selection for hosts without display sockets.
// No rendering, geometry, pixel readback or engine calls are replaced.
#define GLFW_INCLUDE_NONE
#include <GLFW/glfw3.h>
#include <dlfcn.h>
#include <cstdio>
extern "C" int glfwInit(){
 const auto hint=reinterpret_cast<void(*)(int,int)>(dlsym(RTLD_NEXT,"glfwInitHint"));
 const auto init=reinterpret_cast<int(*)()>(dlsym(RTLD_NEXT,"glfwInit"));
 const auto window_hint=reinterpret_cast<void(*)(int,int)>(dlsym(RTLD_NEXT,"glfwWindowHint"));
 if(!hint||!init||!window_hint)return GLFW_FALSE;
 hint(GLFW_PLATFORM,GLFW_PLATFORM_NULL);const int result=init();if(result)window_hint(GLFW_CONTEXT_CREATION_API,GLFW_OSMESA_CONTEXT_API);return result;
}
extern "C" void glfwWindowHint(int hint,int value){
 const auto call=reinterpret_cast<void(*)(int,int)>(dlsym(RTLD_NEXT,"glfwWindowHint"));
 // Core profile is retained; OSMesa cannot set GLFW's forward-compatible bit.
 if(call)call(hint,hint==GLFW_OPENGL_FORWARD_COMPAT?GLFW_FALSE:value);
}
extern "C" void glfwMakeContextCurrent(GLFWwindow* window){
 const auto call=reinterpret_cast<void(*)(GLFWwindow*)>(dlsym(RTLD_NEXT,"glfwMakeContextCurrent"));if(!call)return;call(window);if(!window)return;
 const auto get_proc=reinterpret_cast<GLFWglproc(*)(const char*)>(dlsym(RTLD_NEXT,"glfwGetProcAddress"));if(!get_proc)return;
 const auto get_string=reinterpret_cast<const unsigned char*(*)(unsigned int)>(get_proc("glGetString"));if(!get_string)return;
 const auto renderer=get_string(0x1F01),version=get_string(0x1F02);if(renderer&&version){std::printf("OSMESA_CONTEXT_RENDERER=%s\nOSMESA_CONTEXT_VERSION=%s\n",renderer,version);std::fflush(stdout);}
}
