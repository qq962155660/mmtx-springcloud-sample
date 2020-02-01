package io.mmtx.demo;



import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.client.discovery.EnableDiscoveryClient;
import org.springframework.cloud.openfeign.EnableFeignClients;

@SpringBootApplication
@EnableFeignClients
@MapperScan("io.mmtx.demo.mapper")
@EnableAutoConfiguration
@EnableDiscoveryClient
public class AppClient {
    public static void main(String[] args) {
    	try{
    		 SpringApplication.run(AppClient.class, args);
    	}catch (Exception e) {
    		System.err.println("系统异常");
    		e.printStackTrace();
    	}catch (Throwable e) {
    		System.err.println("系统错误");
    		e.printStackTrace();
		}
       
    }
}
